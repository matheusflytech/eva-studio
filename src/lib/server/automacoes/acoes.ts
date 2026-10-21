import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Contexto } from "@/lib/automacoes/condicoes";
import type { Objeto } from "@/lib/automacoes/tipos";
import type { ContextoDaExecucao } from "./contexto";

// ---------------------------------------------------------------------------
// Ações que o motor sabe executar. Cada uma recebe a configuração já com as
// variáveis trocadas e diz: deu certo (com saída, que vira `passos.<id>`),
// pulou (com o motivo) ou falhou (retentável ou não).
//
// Roda dentro de comAtor({ tipo: "automacao", ... }): o que a ação mudar no
// CRM sai com esse ator, e o anti-loop do barramento enxerga.
// A parte D das automações completa o catálogo; aqui ficam as básicas.
// ---------------------------------------------------------------------------

export interface CtxDaAcao {
  orgId: string;
  automacaoId: string;
  execucaoId: string;
  objeto: Objeto;
  objetoId: string;
  contexto: Contexto;
  ids: ContextoDaExecucao["ids"];
  /** `execucao:no:tentativa`: ação externa manda junto e confere antes de repetir. */
  idempotencia: string;
  teste: boolean;
  agora: Date;
}

export type ResultadoDaAcao =
  | { ok: true; saida?: Record<string, unknown>; pulado?: string }
  | { ok: false; erro: string; retentavel?: boolean; tentarDepoisMs?: number };

export type ManipuladorDeAcao = (config: Record<string, unknown>, ctx: CtxDaAcao) => Promise<ResultadoDaAcao>;

const semContato: ResultadoDaAcao = { ok: true, pulado: "sem contato ligado ao registro" };

async function tagDoContrato(orgId: string, tagId: unknown) {
  return typeof tagId === "string" && tagId ? prisma.tag.findFirst({ where: { id: tagId, orgId }, select: { id: true } }) : null;
}

export const MANIPULADORES: Partial<Record<string, ManipuladorDeAcao>> = {
  async "note.create"(config, ctx) {
    const texto = String(config.texto ?? "").trim();
    if (!texto) return { ok: false, erro: "Nota sem texto." };
    const dealId = ctx.objeto === "deal" ? ctx.objetoId : null;
    const contactId = ctx.objeto === "contact" ? ctx.objetoId : ctx.ids.contato;
    if (!dealId && !contactId) return { ok: true, pulado: "nada onde anotar" };
    const { addNote } = await import("@/lib/server/crm");
    const nota = await addNote({ orgId: ctx.orgId, text: texto, dealId, contactId, authorId: null });
    return { ok: true, saida: { id: nota.id } };
  },

  async "contact.add_tag"(config, ctx) {
    const contato = ctx.objeto === "contact" ? ctx.objetoId : ctx.ids.contato;
    if (!contato) return semContato;
    const tag = await tagDoContrato(ctx.orgId, config.tag);
    if (!tag) return { ok: false, erro: "Etiqueta não existe mais." };
    const { applyTag } = await import("@/lib/server/contacts");
    await applyTag(contato, tag.id);
    return { ok: true, saida: { contact_id: contato, tag_id: tag.id } };
  },

  async "contact.remove_tag"(config, ctx) {
    const contato = ctx.objeto === "contact" ? ctx.objetoId : ctx.ids.contato;
    if (!contato) return semContato;
    const tag = await tagDoContrato(ctx.orgId, config.tag);
    if (!tag) return { ok: true, pulado: "etiqueta não existe mais" };
    const { removeTag } = await import("@/lib/server/contacts");
    await removeTag(contato, tag.id);
    return { ok: true, saida: { contact_id: contato, tag_id: tag.id } };
  },
};
