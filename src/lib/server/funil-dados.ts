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
import { lerRegras } from "@/lib/server/regras-de-etapa";
import { ultimaAtividadePorNegocio } from "@/lib/server/atividade-do-negocio";

// Busca o que as fontes do funil precisam e chama as contas puras de
// src/lib/funil-metricas.ts. Separado de analytics.ts para ser testado sem
// simular as dez outras consultas do dashboard.

const LIMITE = 5000;
// Prazo de parado de etapa sem regra conhecida (o de antes das regras de etapa).
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
  /** O funil que foi usado (o pedido ou o padrão). */
  funil?: { id: string; name: string } | null;
}

/** Filtros extras do Dashboard. O /deals não passa nenhum. */
export interface FiltrosDoFunil {
  /** Responsáveis; "__nenhum" = sem responsável. */
  donos?: string[];
  /** Fim (exclusivo) do período, para intervalos que não terminam hoje. */
  ate?: Date;
}

const VAZIO: DadosDoFunil = {
  numeros: { taxaDeGanho: null, cicloDeVenda: null },
  quebras: { tempoPorEtapa: [], motivosDePerda: [] },
  tabelas: { negociosParados: [] },
  funis: { funilConversao: [] },
  historicoDesde: null,
  funil: null,
};

export async function coletarFunil(
  orgId: string,
  desde: Date,
  agora = new Date(),
  pipelineId?: string,
  filtros: FiltrosDoFunil = {}
): Promise<DadosDoFunil> {
  // Funil pedido (sempre da organização) ou, sem pedido, o padrão; sem
  // padrão, o primeiro da lista.
  const funil = await prisma.pipeline.findFirst({
    where: pipelineId ? { orgId, id: pipelineId } : { orgId },
    orderBy: [{ isDefault: "desc" }, { position: "asc" }],
    select: { id: true, name: true },
  });
  if (!funil) return VAZIO;

  const donos = filtros.donos ?? [];
  const idsDonos = donos.filter((d) => d !== "__nenhum");
  const porDono =
    donos.length === 0
      ? {}
      : { AND: [{ OR: [...(idsDonos.length ? [{ ownerId: { in: idsDonos } }] : []), ...(donos.includes("__nenhum") ? [{ ownerId: null }] : [])] }] };
  const ate = filtros.ate;
  const noPeriodo = (d: Date | null) => !!d && d >= desde && (!ate || d < ate);

  const [linhasEtapa, linhasNegocio] = await Promise.all([
    prisma.pipelineStage.findMany({ where: { pipelineId: funil.id }, orderBy: { position: "asc" } }),
    prisma.deal.findMany({
      where: {
        orgId,
        pipelineId: funil.id,
        archivedAt: null,
        OR: [{ createdAt: { gte: desde } }, { closedAt: null }, { closedAt: { gte: desde } }],
        ...porDono,
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

  // Regras de etapa: prazo de parado por etapa, última atividade dos abertos e
  // o motivo estruturado da perda (sem as tabelas, os padrões de antes).
  const tiposPorId = new Map(linhasEtapa.map((e) => [e.id, e.type]));
  const [{ regras }, atividade, perdas] = await Promise.all([
    lerRegras(linhasEtapa),
    ultimaAtividadePorNegocio(linhasNegocio.filter((n) => !n.closedAt).map((n) => n.id)),
    rotulosDasPerdas(linhasNegocio.filter((n) => tiposPorId.get(n.stageId) === "lost").map((n) => n.id)),
  ]);

  const etapas: EtapaF[] = linhasEtapa.map((e) => ({
    id: e.id,
    nome: e.name,
    posicao: e.position,
    tipo: e.type,
    diasParado: regras.get(e.id)?.diasParado ?? null,
  }));
  const todos: NegocioF[] = linhasNegocio.map((n) => ({
    id: n.id,
    nome: n.name,
    etapaId: n.stageId,
    criadoEm: n.createdAt,
    fechadoEm: n.closedAt,
    naEtapaDesde: n.stageSince,
    valorCentavos: n.amountCents,
    // "Motivos de perda" agrupa pelo motivo estruturado; sem ele, o texto antigo.
    motivoPerda: perdas.get(n.id) ?? n.lostReason,
    ultimaAtividade: atividade.get(n.id) ?? null,
  }));
  const eventos: EventoF[] = linhasEvento.map((e) => ({ dealId: e.dealId, de: e.fromStageId, para: e.toStageId, em: e.at }));

  const criadosNoPeriodo = todos.filter((n) => noPeriodo(n.criadoEm));
  const fechadosNoPeriodo = todos.filter((n) => noPeriodo(n.fechadoEm));
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
        quando: p.desde.toISOString(),
        titulo: p.nome,
        contato: "",
        etapa: p.etapa,
        responsavel: "",
        valorCents: p.valorCentavos,
      })),
    },
    funis: { funilConversao: conversaoPorEtapa(etapas, criadosNoPeriodo, eventos) },
    historicoDesde: primeiro?.at ?? null,
    funil: { id: funil.id, name: funil.name },
  };
}

/** Rótulo do motivo estruturado de cada negócio perdido. Sem a tabela: mapa vazio. */
async function rotulosDasPerdas(dealIds: string[]): Promise<Map<string, string>> {
  if (dealIds.length === 0) return new Map();
  try {
    const linhas = await prisma.dealLoss.findMany({ where: { dealId: { in: dealIds } }, select: { dealId: true, reasonLabel: true } });
    return new Map(linhas.map((l) => [l.dealId, l.reasonLabel]));
  } catch {
    return new Map();
  }
}
