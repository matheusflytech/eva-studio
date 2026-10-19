import "server-only";
import { prisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// Webhook de template da Meta (object "whatsapp_business_account").
//
// Campos assinados no app: message_template_status_update (aprovado,
// rejeitado, pausado...) e template_category_update (a Meta reclassificou,
// ex.: de Utilidade para Marketing — muda o preço por conversa). entry.id é
// o WABA, não o phone_number_id, por isso a busca é pelos agentes do WABA.
// ---------------------------------------------------------------------------

export const CAMPOS_DE_TEMPLATE = new Set(["message_template_status_update", "template_category_update"]);

export type EventoDeTemplate =
  | { tipo: "status"; metaTemplateId: string; nome: string; idioma: string; status: string; motivo: string | null }
  | { tipo: "categoria"; metaTemplateId: string; nome: string; idioma: string; categoria: string };

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "";
}

export function lerEventoDeTemplate(field: string | undefined, value: unknown): EventoDeTemplate | null {
  if (!field || !CAMPOS_DE_TEMPLATE.has(field) || !value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const metaTemplateId = texto(v.message_template_id);
  const nome = texto(v.message_template_name);
  const idioma = texto(v.message_template_language);
  if (!metaTemplateId && !nome) return null;

  if (field === "template_category_update") {
    const categoria = texto(v.new_category) || texto(v.correct_category);
    if (!categoria) return null;
    return { tipo: "categoria", metaTemplateId, nome, idioma, categoria };
  }

  const status = texto(v.event).toUpperCase();
  if (!status) return null;
  const outra = (v.other_info ?? null) as { title?: unknown; description?: unknown } | null;
  const reason = texto(v.reason);
  const detalhe = outra ? [texto(outra.title), texto(outra.description)].filter(Boolean).join(": ") : "";
  const motivo = detalhe || (reason && reason !== "NONE" ? reason : "");
  return { tipo: "status", metaTemplateId, nome, idioma, status, motivo: motivo || null };
}

/** Grava o evento nos modelos locais. Devolve quantos foram atualizados. */
export async function aplicarEventoDeTemplate(wabaId: string, evento: EventoDeTemplate): Promise<number> {
  const conexoes = await prisma.metaConnection.findMany({ where: { wabaId }, select: { agentId: true } });
  if (conexoes.length === 0) return 0;
  const agentes = { in: conexoes.map((c) => c.agentId) };

  const data =
    evento.tipo === "status"
      ? { metaStatus: evento.status, metaStatusReason: evento.motivo, metaStatusAt: new Date() }
      : { category: evento.categoria.toLowerCase() };

  if (evento.metaTemplateId) {
    const r = await prisma.messageTemplate.updateMany({
      where: { agentId: agentes, metaTemplateId: evento.metaTemplateId },
      data,
    });
    if (r.count > 0) return r.count;
  }

  // Modelo ligado à mão (pelo nome) antes de existir o id: acha pelo nome e
  // já guarda o id, pra próxima vez bater direto.
  if (!evento.nome) return 0;
  const r = await prisma.messageTemplate.updateMany({
    where: { agentId: agentes, metaTemplateName: evento.nome, metaLanguageCode: evento.idioma || "pt_BR" },
    data: { ...data, ...(evento.metaTemplateId ? { metaTemplateId: evento.metaTemplateId } : {}) },
  });
  return r.count;
}
