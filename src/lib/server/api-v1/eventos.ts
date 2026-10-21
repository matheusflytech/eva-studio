import "server-only";
import { prisma } from "@/lib/db/prisma";
import { assinaturaCobre, filtroDeEventoValido } from "@/lib/webhooks/eventos";
import { ErroApi } from "./http";
import { INCLUDE_NEGOCIO, serializarNegocios } from "./negocios";
import { INCLUDE_CONTATO, serializarContatos } from "./contatos";
import { serializarTarefa } from "./tarefas-notas";

// ---------------------------------------------------------------------------
// GET /v1/events: os mesmos eventos dos webhooks, para quem não tem URL
// pública (n8n no computador, script atrás de firewall) e prefere consultar.
//
// Sem tabela nova: os eventos saem do que o CRM já guarda (histórico de
// etapas, criação de contato, virada de lead, tarefa concluída). Por isso
// valem também para o passado, até 30 dias. Ficam de fora:
// - contact.updated: não há histórico de alteração; use
//   GET /contacts?updated_since=;
// - message.received: volume alto e sem índice por contrato; use o webhook.
// Ordem (horário, chave) crescente e cursor estrito, como o resto da v1.
// ---------------------------------------------------------------------------

export const TIPOS_CONSULTAVEIS = [
  "contact.created",
  "lead.captured",
  "deal.created",
  "deal.stage_changed",
  "deal.won",
  "deal.lost",
  "deal.reopened",
  "task.completed",
] as const;

const JANELA_MAXIMA_MS = 30 * 86_400_000;
const PADRAO_MS = 86_400_000;

export interface EventoConsultado {
  id: string;
  type: string;
  timestamp: string;
  data: Record<string, unknown>;
  previous?: Record<string, unknown>;
}

interface Bruto {
  em: Date;
  /** Desempate estável entre eventos do mesmo instante. */
  chave: string;
  tipo: string;
  objeto: "deal" | "contact" | "task";
  objetoId: string;
  previous?: Record<string, unknown>;
}

interface Cursor {
  t: string;
  k: string;
}

export function codificarCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

export function lerCursor(bruto: string | null): Cursor | null {
  if (!bruto) return null;
  try {
    const c = JSON.parse(Buffer.from(bruto, "base64url").toString("utf8")) as Cursor;
    if (typeof c.t === "string" && typeof c.k === "string" && !Number.isNaN(Date.parse(c.t))) return c;
  } catch {
    /* cai no erro abaixo */
  }
  throw new ErroApi(400, "invalid_cursor", "cursor inválido. Use o next_cursor da resposta anterior.", { param: "cursor" });
}

/** "deal.*,task.completed" → filtros; vazio = todos os consultáveis. */
export function lerTipos(bruto: string | null): string[] {
  const lista = (bruto ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (lista.length === 0) return ["*"];
  for (const f of lista) {
    if (!filtroDeEventoValido(f)) throw new ErroApi(400, "invalid_parameter", `Tipo de evento desconhecido: ${f}.`, { param: "types" });
  }
  return lista;
}

const depois = (e: Bruto, c: Cursor | null) => !c || e.em.toISOString() > c.t || (e.em.toISOString() === c.t && e.chave > c.k);
const ordem = (a: Bruto, b: Bruto) => a.em.getTime() - b.em.getTime() || (a.chave < b.chave ? -1 : a.chave > b.chave ? 1 : 0);

export async function listarEventos(
  orgId: string,
  opcoes: { tipos: string[]; desde?: Date; cursor: Cursor | null; limite: number; agora?: Date }
): Promise<{ data: EventoConsultado[]; has_more: boolean; next_cursor: string | null }> {
  const agora = opcoes.agora ?? new Date();
  const piso = new Date(agora.getTime() - JANELA_MAXIMA_MS);
  let inicio = opcoes.cursor ? new Date(opcoes.cursor.t) : opcoes.desde ?? new Date(agora.getTime() - PADRAO_MS);
  if (inicio < piso) inicio = piso;
  const quer = (tipo: string) => assinaturaCobre(opcoes.tipos, tipo) && tipo !== "webhook.test";
  const quantos = opcoes.limite + 1;
  const brutos: Bruto[] = [];

  const etapas = ["deal.created", "deal.stage_changed", "deal.won", "deal.lost", "deal.reopened"].some(quer);
  if (etapas) {
    const linhas = await prisma.dealStageEvent.findMany({
      where: { orgId, at: { gte: inicio } },
      orderBy: [{ at: "asc" }, { id: "asc" }],
      take: quantos,
      select: { id: true, dealId: true, fromStageId: true, toStageId: true, at: true },
    });
    const ids = [...new Set(linhas.flatMap((l) => [l.fromStageId, l.toStageId]).filter((x): x is string => !!x))];
    const tipos = new Map(
      (await prisma.pipelineStage.findMany({ where: { id: { in: ids } }, select: { id: true, type: true } })).map((s) => [s.id, s.type])
    );
    for (const l of linhas) {
      const base = { em: l.at, objeto: "deal" as const, objetoId: l.dealId };
      if (!l.fromStageId) {
        brutos.push({ ...base, chave: `dse:${l.id}:0`, tipo: "deal.created" });
        continue;
      }
      const previous = { stage_id: l.fromStageId };
      brutos.push({ ...base, chave: `dse:${l.id}:1`, tipo: "deal.stage_changed", previous });
      const de = tipos.get(l.fromStageId) ?? "open";
      const para = tipos.get(l.toStageId) ?? "open";
      const final = para === "won" ? "deal.won" : para === "lost" ? "deal.lost" : de === "won" || de === "lost" ? "deal.reopened" : null;
      if (final) brutos.push({ ...base, chave: `dse:${l.id}:2`, tipo: final, previous });
    }
  }
  if (quer("contact.created")) {
    const linhas = await prisma.contact.findMany({
      where: { orgId, createdAt: { gte: inicio } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: quantos,
      select: { id: true, createdAt: true },
    });
    for (const l of linhas) brutos.push({ em: l.createdAt, chave: `con:${l.id}`, tipo: "contact.created", objeto: "contact", objetoId: l.id });
  }
  if (quer("lead.captured")) {
    const linhas = await prisma.contact.findMany({
      where: { orgId, leadAt: { gte: inicio } },
      orderBy: [{ leadAt: "asc" }, { id: "asc" }],
      take: quantos,
      select: { id: true, leadAt: true },
    });
    for (const l of linhas) brutos.push({ em: l.leadAt!, chave: `lea:${l.id}`, tipo: "lead.captured", objeto: "contact", objetoId: l.id });
  }
  if (quer("task.completed")) {
    const linhas = await prisma.task.findMany({
      where: { orgId, doneAt: { gte: inicio } },
      orderBy: [{ doneAt: "asc" }, { id: "asc" }],
      take: quantos,
      select: { id: true, doneAt: true },
    });
    for (const l of linhas) brutos.push({ em: l.doneAt!, chave: `tsk:${l.id}`, tipo: "task.completed", objeto: "task", objetoId: l.id });
  }

  const pagina = brutos.filter((e) => quer(e.tipo) && depois(e, opcoes.cursor)).sort(ordem);
  const has_more = pagina.length > opcoes.limite;
  const usados = pagina.slice(0, opcoes.limite);

  // O objeto atual, no formato da API (igual ao corpo do webhook).
  const idsDe = (o: Bruto["objeto"]) => [...new Set(usados.filter((e) => e.objeto === o).map((e) => e.objetoId))];
  const [negocios, contatos, tarefas] = await Promise.all([
    idsDe("deal").length ? prisma.deal.findMany({ where: { orgId, id: { in: idsDe("deal") } }, include: INCLUDE_NEGOCIO }) : [],
    idsDe("contact").length ? prisma.contact.findMany({ where: { orgId, id: { in: idsDe("contact") } }, include: INCLUDE_CONTATO }) : [],
    idsDe("task").length ? prisma.task.findMany({ where: { orgId, id: { in: idsDe("task") } } }) : [],
  ]);
  const objetos = new Map<string, Record<string, unknown>>();
  for (const d of await serializarNegocios(orgId, negocios)) objetos.set(`deal:${d.id}`, d as Record<string, unknown>);
  for (const c of await serializarContatos(orgId, contatos)) objetos.set(`contact:${c.id}`, c as Record<string, unknown>);
  for (const t of tarefas) objetos.set(`task:${t.id}`, serializarTarefa(t) as Record<string, unknown>);

  const data: EventoConsultado[] = [];
  for (const e of usados) {
    const objeto = objetos.get(`${e.objeto}:${e.objetoId}`);
    // Apagado depois do evento: o evento sai com só o id.
    data.push({
      id: `evt_${e.chave.replace(/:/g, "_")}`,
      type: e.tipo,
      timestamp: e.em.toISOString(),
      data: objeto ?? { id: e.objetoId, deleted: true },
      ...(e.previous ? { previous: e.previous } : {}),
    });
  }
  const ultimo = usados.at(-1);
  return {
    data,
    has_more,
    // Sem mais nada: o cursor do último visto, para a próxima consulta pegar só o novo.
    next_cursor: ultimo ? codificarCursor({ t: ultimo.em.toISOString(), k: ultimo.chave }) : opcoes.cursor ? codificarCursor(opcoes.cursor) : null,
  };
}
