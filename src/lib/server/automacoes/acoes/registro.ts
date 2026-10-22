import "server-only";
import { prisma } from "@/lib/db/prisma";
import { numero } from "@/lib/automacoes/condicoes";
import { contatoDaAcao, seguro } from "./comum";
import type { ManipuladorDeAcao } from "./tipos";

// Ações de registro: campos, etapa, ganho/perda, criar negócio, contato,
// etiqueta e nota. Passam pelas mesmas funções da API v1 (mesmas regras e os
// mesmos eventos), com origem "automacao" no histórico de etapas.

const NUMERICOS = new Set(["amount_cents", "probability", "position", "size"]);
const BOOLEANOS = new Set(["opt_in", "archived"]);

/** { campo: "registro.x" | "registro.custom_fields.k", valor } → corpo da API v1. */
export function corpoDosCampos(campos: unknown): Record<string, unknown> {
  const corpo: Record<string, unknown> = {};
  const custom: Record<string, unknown> = {};
  for (const c of Array.isArray(campos) ? (campos as { campo?: unknown; valor?: unknown }[]) : []) {
    const k = String(c?.campo ?? "").replace(/^registro\./, "");
    if (!k) continue;
    let v: unknown = c.valor;
    // Vazio limpa o campo.
    if (v === "" || v === undefined) v = null;
    else if (NUMERICOS.has(k) && numero(v) !== null) v = numero(v);
    else if (BOOLEANOS.has(k) && (v === "true" || v === "false")) v = v === "true";
    if (k.startsWith("custom_fields.")) custom[k.slice("custom_fields.".length)] = v;
    else corpo[k] = v;
  }
  if (Object.keys(custom).length) corpo.custom_fields = custom;
  return corpo;
}

/** Ganho/perda pela automação: etapa do tipo no funil do negócio, origem "automacao". */
async function fechar(orgId: string, dealId: string, tipo: "won" | "lost", motivo?: string) {
  const deal = await prisma.deal.findFirst({ where: { id: dealId, orgId }, select: { pipelineId: true } });
  if (!deal) return { ok: false as const, erro: "Negócio não encontrado." };
  const etapa = await prisma.pipelineStage.findFirst({ where: { pipelineId: deal.pipelineId, type: tipo }, orderBy: { position: "asc" }, select: { id: true } });
  if (!etapa) return { ok: false as const, erro: `O funil deste negócio não tem etapa de ${tipo === "won" ? "ganho" : "perda"}.` };
  const { moverNegocio } = await import("@/lib/server/api-v1/negocios");
  const r = await moverNegocio(orgId, dealId, { stageId: etapa.id, ...(motivo ? { lostReason: motivo } : {}) }, { origem: "automacao", ignorarObrigatorios: true });
  return r.mudou ? { ok: true as const, saida: { status: tipo, stage_id: etapa.id } } : { ok: true as const, pulado: `já estava ${tipo === "won" ? "ganho" : "perdido"}` };
}

const tagDoContrato = async (orgId: string, tagId: unknown) =>
  typeof tagId === "string" && tagId ? prisma.tag.findFirst({ where: { id: tagId, orgId }, select: { id: true } }) : null;

export const ACOES_DE_REGISTRO: Record<string, ManipuladorDeAcao> = {
  "record.update_fields": (config, ctx) =>
    seguro(async () => {
      const corpo = corpoDosCampos(config.campos);
      if (!Object.keys(corpo).length) return { ok: true, pulado: "nenhum campo escolhido" };
      const { conferirCampos } = await import("@/lib/server/api-v1/entrada");
      if (ctx.objeto === "deal") {
        const m = await import("@/lib/server/api-v1/negocios");
        conferirCampos(corpo, m.CAMPOS_DE_PATCH_DE_NEGOCIO);
        const r = await m.atualizarNegocio(ctx.orgId, ctx.objetoId, await m.lerDadosDeNegocio(ctx.orgId, corpo), { origem: "automacao", ignorarObrigatorios: true });
        return { ok: true, saida: { mudou: r.mudou, campos: Object.keys(corpo) } };
      }
      if (ctx.objeto === "contact") {
        const m = await import("@/lib/server/api-v1/contatos");
        conferirCampos(corpo, m.CAMPOS_DE_CONTATO);
        const r = await m.atualizarContato(ctx.orgId, ctx.objetoId, await m.lerDadosDeContato(ctx.orgId, corpo));
        return { ok: true, saida: { mudou: r.mudou, campos: Object.keys(corpo) } };
      }
      if (ctx.objeto === "company") {
        const m = await import("@/lib/server/api-v1/empresas");
        conferirCampos(corpo, m.CAMPOS_DE_EMPRESA);
        const r = await m.atualizarEmpresa(ctx.orgId, ctx.objetoId, await m.lerDadosDeEmpresa(ctx.orgId, corpo));
        return { ok: true, saida: { mudou: r.mudou, campos: Object.keys(corpo) } };
      }
      if (ctx.objeto === "task") {
        const data: Record<string, unknown> = {};
        if (typeof corpo.text === "string") data.text = corpo.text;
        if (typeof corpo.type === "string") data.type = corpo.type;
        if ("due_at" in corpo) data.dueAt = corpo.due_at ? new Date(String(corpo.due_at)) : null;
        if (data.dueAt instanceof Date && Number.isNaN(data.dueAt.getTime())) return { ok: false, erro: "Prazo inválido." };
        if (!Object.keys(data).length) return { ok: false, erro: "Na tarefa só dá para mudar texto, tipo e prazo." };
        await prisma.task.updateMany({ where: { id: ctx.objetoId, orgId: ctx.orgId }, data });
        return { ok: true, saida: { campos: Object.keys(data) } };
      }
      return { ok: false, erro: "Este tipo de registro não tem campos para atualizar." };
    }),

  "deal.move_stage": (config, ctx) =>
    seguro(async () => {
      const { moverNegocio } = await import("@/lib/server/api-v1/negocios");
      const r = await moverNegocio(ctx.orgId, ctx.objetoId, { stageId: String(config.etapa ?? "") }, { origem: "automacao", ignorarObrigatorios: true });
      return r.mudou ? { ok: true, saida: { stage_id: config.etapa, pipeline_id: r.pipelineId } } : { ok: true, pulado: "já estava nesta etapa" };
    }),

  "deal.mark_won": (_config, ctx) => seguro(() => fechar(ctx.orgId, ctx.objetoId, "won")),

  "deal.mark_lost": (config, ctx) => seguro(() => fechar(ctx.orgId, ctx.objetoId, "lost", String(config.motivo ?? "").slice(0, 500))),

  "deal.create": (config, ctx) =>
    seguro(async () => {
      const contato = contatoDaAcao(ctx);
      const empresa = ctx.objeto === "company" ? ctx.objetoId : ctx.ids.empresa;
      const { createDeal, findOpenDealForContact } = await import("@/lib/server/crm");
      if ((config.se_ja_tem ?? "pular") === "pular" && contato) {
        const aberto = await findOpenDealForContact(contato);
        if (aberto) return { ok: true, pulado: "o contato já tem negócio aberto", saida: { deal_id: aberto.id } };
      }
      const etapa = await prisma.pipelineStage.findFirst({ where: { id: String(config.etapa ?? ""), pipeline: { orgId: ctx.orgId } }, select: { id: true, pipelineId: true } });
      if (!etapa) return { ok: false, erro: "A etapa escolhida não existe mais." };
      const valor = numero(config.valor_centavos);
      const deal = await createDeal({
        orgId: ctx.orgId,
        name: String(config.nome ?? "").trim() || "Negócio",
        pipelineId: etapa.pipelineId,
        stageId: etapa.id,
        contactId: contato,
        companyId: empresa,
        ownerId: ctx.ids.responsavel,
        amountCents: valor !== null ? Math.max(0, Math.round(valor)) : undefined,
        origem: "automacao",
      });
      return { ok: true, saida: { deal_id: deal.id } };
    }),

  "contact.upsert": (config, ctx) =>
    seguro(async () => {
      const corpo = Object.fromEntries(
        [
          ["name", config.nome],
          ["email", config.email],
          ["phone", config.telefone],
        ].filter(([, v]) => typeof v === "string" && v.trim() !== "")
      );
      if (!corpo.email && !corpo.phone) return { ok: false, erro: "Informe o e-mail ou o telefone do contato." };
      const { lerDadosDeContato, upsertContato } = await import("@/lib/server/api-v1/contatos");
      const r = await upsertContato(ctx.orgId, await lerDadosDeContato(ctx.orgId, corpo));
      if (ctx.objeto === "deal") {
        await prisma.dealContact.upsert({ where: { dealId_contactId: { dealId: ctx.objetoId, contactId: r.id } }, create: { dealId: ctx.objetoId, contactId: r.id }, update: {} });
      }
      return { ok: true, saida: { contact_id: r.id, resultado: r.result } };
    }),

  "contact.add_tag": (config, ctx) =>
    seguro(async () => {
      const contato = contatoDaAcao(ctx);
      if (!contato) return { ok: true, pulado: "sem contato ligado ao registro" };
      const tag = await tagDoContrato(ctx.orgId, config.tag);
      if (!tag) return { ok: false, erro: "Etiqueta não existe mais." };
      const { applyTag } = await import("@/lib/server/contacts");
      await applyTag(contato, tag.id);
      return { ok: true, saida: { contact_id: contato, tag_id: tag.id } };
    }),

  "contact.remove_tag": (config, ctx) =>
    seguro(async () => {
      const contato = contatoDaAcao(ctx);
      if (!contato) return { ok: true, pulado: "sem contato ligado ao registro" };
      const tag = await tagDoContrato(ctx.orgId, config.tag);
      if (!tag) return { ok: true, pulado: "etiqueta não existe mais" };
      const { removeTag } = await import("@/lib/server/contacts");
      await removeTag(contato, tag.id);
      return { ok: true, saida: { contact_id: contato, tag_id: tag.id } };
    }),

  "note.create": (config, ctx) =>
    seguro(async () => {
      const texto = String(config.texto ?? "").trim();
      if (!texto) return { ok: false, erro: "Nota sem texto." };
      const dealId = ctx.objeto === "deal" ? ctx.objetoId : null;
      const contactId = contatoDaAcao(ctx);
      if (!dealId && !contactId) return { ok: true, pulado: "nada onde anotar" };
      const { addNote } = await import("@/lib/server/crm");
      const nota = await addNote({ orgId: ctx.orgId, text: texto.slice(0, 5000), dealId, contactId, authorId: null });
      return { ok: true, saida: { id: nota.id } };
    }),
};
