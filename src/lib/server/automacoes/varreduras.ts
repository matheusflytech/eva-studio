import "server-only";
import { prisma } from "@/lib/db/prisma";
import { partesEmSP } from "@/lib/fuso-sp";
import { diaEmSP, somarDias, diaDaSemana } from "@/lib/tarefas/calendario";
import { gatilhoDoTipo } from "@/lib/automacoes/catalogo";
import type { Definicao } from "@/lib/automacoes/tipos";
import { buildSegmentWhere, parseRules } from "@/lib/server/segments";
import { inscrever, type AutomacaoParaInscrever } from "./inscricao";
import { executarExecucao } from "./executor";

// ---------------------------------------------------------------------------
// Passo do relógio das automações (a cada minuto):
//  1. devolve à fila execuções com lease vencido (o processo morreu no meio);
//  2. gatilhos de varredura: parado há dias, tarefa atrasada, data de um
//     campo, agendado, cliente sem responder e aguardando atendente. Cada
//     um com chave do período, então rodar de novo no mesmo período não
//     inscreve duas vezes;
//  3. roda as execuções vencidas (esperas que acabaram, novas tentativas);
//  4. de hora em hora, apaga passos e eventos com mais de 90 dias.
// Sem as tabelas, não faz nada.
// ---------------------------------------------------------------------------

const POR_AUTOMACAO = 200;
const RETENCAO_DIAS = 90;
/** Teste esquecido (janela fechada no meio) para sozinho depois disto: não fica mandando WhatsApp. */
export const TESTE_MAX_MS = 30 * 60_000;

type Ativa = AutomacaoParaInscrever & { definicao: Definicao };

const dia = (d: { ano: number; mes: number; dia: number }) => `${d.ano}-${String(d.mes).padStart(2, "0")}-${String(d.dia).padStart(2, "0")}`;

function passouDaHora(agora: Date, hora: unknown): boolean {
  const m = String(hora ?? "09:00").match(/^(\d{1,2}):(\d{2})$/);
  const [h, min] = m ? [Number(m[1]), Number(m[2])] : [9, 0];
  const p = partesEmSP(agora);
  return p.hora > h || (p.hora === h && p.minuto >= min);
}

/** Coluna do banco por trás de um campo de data do catálogo. */
const COLUNAS_DE_DATA: Record<string, Record<string, string>> = {
  deal: { expected_closing_at: "expectedClosingAt", created_at: "createdAt" },
  contact: { created_at: "createdAt" },
  company: { created_at: "createdAt" },
};
const TABELAS: Record<string, string> = { deal: "eva_studio_deals", contact: "eva_studio_contacts", company: "eva_studio_companies" };

/** Ids dos registros cuja data (+dias) cai hoje em SP. Campo personalizado guarda "AAAA-MM-DD". */
async function registrosDaData(a: Ativa, c: Record<string, unknown>, agora: Date): Promise<string[]> {
  const tabela = TABELAS[a.objeto];
  if (!tabela) return [];
  const campo = String(c.campo ?? "").replace(/^registro\./, "");
  const alvo = somarDias(diaEmSP(agora), -Math.trunc(Number(c.dias) || 0));
  const todoAno = c.todo_ano === true;
  const md = dia(alvo).slice(5);
  const coluna = COLUNAS_DE_DATA[a.objeto]?.[campo];
  const personalizado = campo.startsWith("custom_fields.") ? campo.slice("custom_fields.".length) : null;
  if (!coluna && !personalizado) return [];
  if (personalizado && !/^[\w-]{1,64}$/.test(personalizado)) return [];
  // Nome de tabela/coluna vem de lista fixa acima; valores vão como parâmetro.
  const expr = coluna ? `("${coluna}" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo')::date` : `NULLIF(substring("customFields"->>$3 from '^\\d{4}-\\d{2}-\\d{2}'), '')::date`;
  const filtro = todoAno ? `to_char(${expr}, 'MM-DD') = $2` : `${expr} = $2::date`;
  const sql = `SELECT "id" FROM "${tabela}" WHERE "orgId" = $1 AND ${filtro} LIMIT ${POR_AUTOMACAO}`;
  const linhas = await prisma.$queryRawUnsafe<{ id: string }[]>(sql, a.orgId, todoAno ? md : dia(alvo), ...(personalizado ? [personalizado] : []));
  return linhas.map((l) => l.id);
}

/** Quem atende o gatilho de varredura agora, com a "origem" que dá a chave do período. */
async function candidatos(a: Ativa, agora: Date): Promise<{ id: string; origem: string; gatilho: Record<string, unknown> }[]> {
  const g = a.definicao.gatilho;
  if (!g) return [];
  const c = g.config ?? {};
  const hoje = dia(diaEmSP(agora));
  switch (g.tipo) {
    case "deal.stale": {
      const limite = new Date(agora.getTime() - (Number(c.dias) || 7) * 86_400_000);
      const deals = await prisma.deal.findMany({
        where: {
          orgId: a.orgId,
          closedAt: null,
          archivedAt: null,
          stageSince: { lte: limite },
          ...(c.etapa ? { stageId: String(c.etapa) } : {}),
          OR: [{ activity: { is: null } }, { activity: { lastActivityAt: { lte: limite } } }],
        },
        select: { id: true, stageSince: true, stageId: true },
        take: POR_AUTOMACAO,
      });
      return deals.map((d) => ({ id: d.id, origem: `parado:${d.stageId}:${d.stageSince.toISOString()}`, gatilho: { tipo: g.tipo, stage_id: d.stageId } }));
    }
    case "task.overdue": {
      const limite = new Date(agora.getTime() - (Number(c.horas) || 0) * 3_600_000);
      const tarefas = await prisma.task.findMany({ where: { orgId: a.orgId, doneAt: null, dueAt: { lte: limite } }, select: { id: true, dueAt: true }, take: POR_AUTOMACAO });
      return tarefas.map((t) => ({ id: t.id, origem: `atrasada:${t.dueAt?.toISOString()}`, gatilho: { tipo: g.tipo, due_at: t.dueAt?.toISOString() } }));
    }
    case "deal.date_relative":
    case "contact.date_relative":
    case "company.date_relative": {
      if (!passouDaHora(agora, c.hora)) return [];
      const ids = await registrosDaData(a, c, agora);
      return ids.map((id) => ({ id, origem: `data:${hoje}`, gatilho: { tipo: g.tipo, dia: hoje } }));
    }
    case "deal.schedule":
    case "contact.schedule": {
      if (!passouDaHora(agora, c.hora)) return [];
      if (c.frequencia === "semanal" && String(diaDaSemana(diaEmSP(agora))) !== String(c.dia_semana ?? "1")) return [];
      const origem = `agendado:${hoje}`;
      if (g.tipo === "deal.schedule") {
        const deals = await prisma.deal.findMany({
          where: { orgId: a.orgId, closedAt: null, archivedAt: null, ...(c.funil ? { pipelineId: String(c.funil) } : {}), ...(c.etapa ? { stageId: String(c.etapa) } : {}) },
          select: { id: true },
          take: POR_AUTOMACAO,
        });
        return deals.map((d) => ({ id: d.id, origem, gatilho: { tipo: g.tipo, dia: hoje } }));
      }
      const seg = await prisma.segment.findFirst({ where: { id: String(c.segmento ?? ""), orgId: a.orgId } });
      if (!seg) return [];
      const contatos = await prisma.contact.findMany({ where: buildSegmentWhere(a.orgId, seg.match, parseRules(seg.rules)), select: { id: true }, take: POR_AUTOMACAO });
      return contatos.map((x) => ({ id: x.id, origem, gatilho: { tipo: g.tipo, dia: hoje } }));
    }
    case "conversation.no_reply": {
      const limite = new Date(agora.getTime() - (Number(c.horas) || 24) * 3_600_000);
      const conversas = await prisma.conversation.findMany({
        where: {
          agent: { orgId: a.orgId },
          lastMessageRole: { in: ["bot", "human"] },
          lastMessageAt: { lte: limite },
          channel: c.canal ? String(c.canal) : { notIn: ["playground", "builder_preview"] },
        },
        select: { id: true, lastMessageAt: true },
        take: POR_AUTOMACAO,
      });
      return conversas.map((x) => ({ id: x.id, origem: `sem_resposta:${x.lastMessageAt.toISOString()}`, gatilho: { tipo: g.tipo, last_message_at: x.lastMessageAt.toISOString() } }));
    }
    case "conversation.waiting_human": {
      const limite = new Date(agora.getTime() - (Number(c.minutos) || 5) * 60_000);
      const conversas = await prisma.conversation.findMany({
        where: { agent: { orgId: a.orgId }, status: "waiting_human", updatedAt: { lte: limite } },
        select: { id: true, updatedAt: true },
        take: POR_AUTOMACAO,
      });
      return conversas.map((x) => ({ id: x.id, origem: `fila:${x.updatedAt.toISOString()}`, gatilho: { tipo: g.tipo } }));
    }
    default:
      return [];
  }
}

export async function rodarAutomacoes(opcoes: { orcamentoMs?: number; agora?: Date } = {}) {
  const inicio = Date.now();
  const fim = inicio + (opcoes.orcamentoMs ?? 15_000);
  const agora = opcoes.agora ?? new Date();
  const r = { leases: 0, inscritas: 0, executadas: 0, limpos: 0 };
  try {
    // 1. Lease vencido: volta para a fila.
    r.leases = (await prisma.automacaoExecucao.updateMany({ where: { status: "rodando", travadaAte: { lt: agora } }, data: { status: "pendente", travadaAte: null, proximaEm: agora } })).count;

    // 2. Gatilhos de varredura.
    const ativas = await prisma.automacao.findMany({
      where: { status: "ativa", versaoPublicadaId: { not: null } },
      include: { versaoPublicada: { select: { definicao: true } } },
    });
    for (const a of ativas) {
      if (Date.now() > fim) break;
      const definicao = a.versaoPublicada?.definicao as unknown as Definicao;
      const item = definicao?.gatilho ? gatilhoDoTipo(definicao.gatilho.tipo) : undefined;
      if (item?.modo !== "varredura") continue;
      try {
        for (const cand of await candidatos({ ...a, definicao }, agora)) {
          if (Date.now() > fim) break;
          const x = await inscrever(a, cand.id, { origem: cand.origem, gatilho: cand.gatilho });
          if (x.inscrita) r.inscritas++;
        }
      } catch (e) {
        console.error("[automacoes] varredura falhou", a.id, e instanceof Error ? e.message : e);
      }
    }

    // 3. Execuções vencidas. Antes, para os testes esquecidos.
    await prisma.automacaoExecucao.updateMany({
      where: { teste: true, status: { in: ["pendente", "esperando"] }, createdAt: { lt: new Date(agora.getTime() - TESTE_MAX_MS) } },
      data: { status: "cancelada", erro: "Teste parado sozinho: passou de 30 minutos.", proximaEm: null, terminadaEm: agora },
    });
    const vencidas = await prisma.automacaoExecucao.findMany({
      where: { status: { in: ["pendente", "esperando"] }, proximaEm: { lte: agora } },
      orderBy: { proximaEm: "asc" },
      select: { id: true },
      take: 100,
    });
    for (const v of vencidas) {
      if (Date.now() > fim) break;
      const x = await executarExecucao(v.id).catch((e) => {
        console.error("[automacoes] execução falhou", v.id, e instanceof Error ? e.message : e);
        return null;
      });
      if (x) r.executadas++;
    }

    // 4. Limpeza, uma vez por hora.
    if (partesEmSP(agora).minuto === 0) {
      const corte = new Date(agora.getTime() - RETENCAO_DIAS * 86_400_000);
      const passos = await prisma.automacaoPasso.deleteMany({ where: { execucao: { terminadaEm: { lt: corte } } } });
      const eventos = await prisma.eventoDeDominio.deleteMany({ where: { processadoEm: { lt: corte } } });
      r.limpos = passos.count + eventos.count;
    }
  } catch (e) {
    // Sem as tabelas (SQL não aplicado): nada a fazer.
    if (!/eva_studio_automac|eva_studio_eventos|does not exist|P2021/i.test(String((e as Error)?.message ?? e))) throw e;
  }
  return r;
}
