import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { CtxDaAcao, ResultadoDaAcao } from "./tipos";

// Ajudantes das ações: erro de regra vira falha definitiva com a mensagem do
// CRM; o resto (banco instável, rede) é retentável.

export async function seguro(fn: () => Promise<ResultadoDaAcao>): Promise<ResultadoDaAcao> {
  try {
    return await fn();
  } catch (e) {
    const nome = (e as Error)?.name ?? "";
    const status = (e as { status?: number })?.status;
    const mensagem = e instanceof Error ? e.message : String(e);
    // ErroApi, ErroDeCrm, ErroDaMudanca: regra do CRM (etapa que não existe, campo inválido...).
    if (nome === "ErroApi" || (typeof status === "number" && status >= 400 && status < 500)) return { ok: false, erro: mensagem };
    return { ok: false, erro: mensagem, retentavel: true };
  }
}

/** Contato que a ação usa: o próprio registro ou o ligado a ele. */
export const contatoDaAcao = (ctx: CtxDaAcao) => (ctx.objeto === "contact" ? ctx.objetoId : ctx.ids.contato);

/** Negócio que a ação usa: o próprio registro ou o ligado (conversa/tarefa). */
export const negocioDaAcao = (ctx: CtxDaAcao) => (ctx.objeto === "deal" ? ctx.objetoId : ctx.ids.negocio);

/** Só quem é membro ativo do contrato (id que veio da tela pode estar velho). */
export async function membrosAtivos(orgId: string, ids: unknown): Promise<string[]> {
  const lista = (Array.isArray(ids) ? ids : typeof ids === "string" && ids ? [ids] : []).map(String).filter(Boolean);
  if (!lista.length) return [];
  const ativos = await prisma.membership.findMany({ where: { orgId, userId: { in: lista }, status: "ativo" }, select: { userId: true } });
  const ok = new Set(ativos.map((a) => a.userId));
  return lista.filter((id) => ok.has(id));
}

/** JSON digitado na tela (já com as variáveis trocadas). */
export function lerJson(texto: unknown, padrao: unknown = {}): { ok: true; valor: unknown } | { ok: false } {
  if (texto === undefined || texto === null || (typeof texto === "string" && texto.trim() === "")) return { ok: true, valor: padrao };
  if (typeof texto === "object") return { ok: true, valor: texto };
  try {
    return { ok: true, valor: JSON.parse(String(texto)) };
  } catch {
    return { ok: false };
  }
}

const LINKS: Record<string, (id: string) => string> = {
  deal: (id) => `/negocios/${id}`,
  contact: (id) => `/contatos/${id}`,
  company: (id) => `/empresas/${id}`,
  task: () => "/tarefas",
  conversation: () => "/conversas",
};
export const linkDoRegistro = (objeto: string, id: string) => LINKS[objeto]?.(id) ?? null;
