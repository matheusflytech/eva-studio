import "server-only";
import { prisma } from "@/lib/db/prisma";
import {
  conversaoPorEtapa,
  tempoPorEtapa,
  negociosParados,
  motivosDePerda,
  taxaDeGanho,
  cicloDeVenda,
  type EtapaF,
  type NegocioF,
  type EventoF,
  type LinhaDeConversao,
} from "@/lib/funil-metricas";

// Busca o que as fontes do funil precisam e chama as contas puras de
// src/lib/funil-metricas.ts. Separado de analytics.ts para ser testado sem
// simular as dez outras consultas do dashboard.

const LIMITE = 5000;
const PARADO_DIAS = 7;

export interface LinhaParada {
  id: string;
  quando: string | null;
  titulo: string;
  contato: string;
  etapa: string;
  responsavel: string;
  valorCents: number;
}

export interface DadosDoFunil {
  numeros: { taxaDeGanho: number | null; cicloDeVenda: number | null };
  quebras: { tempoPorEtapa: { label: string; value: number }[]; motivosDePerda: { label: string; value: number }[] };
  tabelas: { negociosParados: LinhaParada[] };
  funis: { funilConversao: LinhaDeConversao[] };
  /** Evento mais antigo da organização: antes disso, o histórico é só a etapa atual. */
  historicoDesde: Date | null;
}

const VAZIO: DadosDoFunil = {
  numeros: { taxaDeGanho: null, cicloDeVenda: null },
  quebras: { tempoPorEtapa: [], motivosDePerda: [] },
  tabelas: { negociosParados: [] },
  funis: { funilConversao: [] },
  historicoDesde: null,
};

export async function coletarFunil(orgId: string, desde: Date, agora = new Date()): Promise<DadosDoFunil> {
  // O funil do painel é o padrão; sem padrão, o primeiro da lista.
  const funil = await prisma.pipeline.findFirst({
    where: { orgId },
    orderBy: [{ isDefault: "desc" }, { position: "asc" }],
    select: { id: true },
  });
  if (!funil) return VAZIO;

  const [linhasEtapa, linhasNegocio] = await Promise.all([
    prisma.pipelineStage.findMany({ where: { pipelineId: funil.id }, orderBy: { position: "asc" } }),
    prisma.deal.findMany({
      where: {
        orgId,
        pipelineId: funil.id,
        archivedAt: null,
        OR: [{ createdAt: { gte: desde } }, { closedAt: null }, { closedAt: { gte: desde } }],
      },
      select: { id: true, name: true, stageId: true, createdAt: true, closedAt: true, stageSince: true, amountCents: true, lostReason: true },
      orderBy: { createdAt: "desc" },
      take: LIMITE,
    }),
  ]);

  // Sem a tabela de histórico (SQL ainda não aplicado) o painel continua de
  // pé: cada negócio conta só pela etapa em que está.
  const ids = linhasNegocio.map((n) => n.id);
  const [linhasEvento, primeiro] = await Promise.all([
    ids.length === 0
      ? Promise.resolve([])
      : prisma.dealStageEvent
          .findMany({ where: { orgId, dealId: { in: ids } }, select: { dealId: true, fromStageId: true, toStageId: true, at: true } })
          .catch(() => []),
    // O backfill grava datas aproximadas (a criação do negócio); o aviso conta
    // a partir do primeiro movimento registrado de verdade.
    prisma.dealStageEvent
      .findFirst({ where: { orgId, origem: { not: "backfill" } }, orderBy: { at: "asc" }, select: { at: true } })
      .catch(() => null),
  ]);

  const etapas: EtapaF[] = linhasEtapa.map((e) => ({ id: e.id, nome: e.name, posicao: e.position, tipo: e.type }));
  const todos: NegocioF[] = linhasNegocio.map((n) => ({
    id: n.id,
    nome: n.name,
    etapaId: n.stageId,
    criadoEm: n.createdAt,
    fechadoEm: n.closedAt,
    naEtapaDesde: n.stageSince,
    valorCentavos: n.amountCents,
    motivoPerda: n.lostReason,
  }));
  const eventos: EventoF[] = linhasEvento.map((e) => ({ dealId: e.dealId, de: e.fromStageId, para: e.toStageId, em: e.at }));

  const criadosNoPeriodo = todos.filter((n) => n.criadoEm >= desde);
  const fechadosNoPeriodo = todos.filter((n) => n.fechadoEm && n.fechadoEm >= desde);
  const idsDoPeriodo = new Set(criadosNoPeriodo.map((n) => n.id));

  return {
    numeros: {
      taxaDeGanho: taxaDeGanho(fechadosNoPeriodo, etapas),
      cicloDeVenda: cicloDeVenda(fechadosNoPeriodo, etapas),
    },
    quebras: {
      tempoPorEtapa: tempoPorEtapa(etapas, eventos.filter((e) => e.em >= desde || idsDoPeriodo.has(e.dealId)), agora)
        .filter((t) => t.medianaDias !== null)
        .map((t) => ({ label: t.nome, value: t.medianaDias as number })),
      motivosDePerda: motivosDePerda(fechadosNoPeriodo, etapas),
    },
    tabelas: {
      negociosParados: negociosParados(etapas, todos, agora, PARADO_DIAS).map((p) => ({
        id: p.id,
        quando: todos.find((n) => n.id === p.id)?.naEtapaDesde.toISOString() ?? null,
        titulo: p.nome,
        contato: "",
        etapa: p.etapa,
        responsavel: "",
        valorCents: p.valorCentavos,
      })),
    },
    funis: { funilConversao: conversaoPorEtapa(etapas, criadosNoPeriodo, eventos) },
    historicoDesde: primeiro?.at ?? null,
  };
}
