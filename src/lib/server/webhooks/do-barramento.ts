import "server-only";
import { EVENTOS, type TipoDeEvento } from "@/lib/webhooks/eventos";
import type { EventoPublicado } from "@/lib/server/eventos/barramento";
import { CONTACT_SOURCE, LEAD_STAGE, toPublic } from "@/lib/server/api-v1/public-values";
import { emitirEvento, emitirEventoDeContato, emitirEventoDeEmpresa, emitirEventoDeNegocio, emitirEventoDeTarefa } from "./emitir";

// Consumidor do barramento: evento de domínio que está no catálogo dos
// webhooks vira entrega para os endpoints assinados (o resto é só das automações).

const DO_CATALOGO = new Set<string>(EVENTOS.map((e) => e.tipo));

/** `previous` do webhook: o detalhe do evento (etapa anterior) ou o lado "de" do diff. */
function anterior(e: EventoPublicado): Record<string, unknown> | undefined {
  if (e.diff && Object.keys(e.diff).length) return Object.fromEntries(Object.entries(e.diff).map(([k, v]) => [k, v.de]));
  const p = e.dados.previous;
  return p && typeof p === "object" ? (p as Record<string, unknown>) : undefined;
}

export async function paraWebhooks(e: EventoPublicado): Promise<void> {
  if (!DO_CATALOGO.has(e.tipo)) return;
  const tipo = e.tipo as TipoDeEvento;
  const previous = anterior(e);
  if (e.tipo === "message.received") {
    // A mensagem já vem inteira no evento (não é um objeto da API). `first` é o
    // nome público; `primeira` fica por compatibilidade com quem já lê.
    await emitirEvento(e.orgId, tipo, async () => ({ data: "primeira" in e.dados ? { ...e.dados, first: e.dados.primeira } : e.dados }));
    return;
  }
  if (e.objeto === "deal") {
    // Funil/etapa no `previous` saem pelo número do contrato, como no `data`.
    // Import tardio pelo mesmo motivo do emitir.ts (api-v1 → crm → eventos).
    const { comNumeros } = await import("@/lib/server/api-v1/funis");
    await emitirEventoDeNegocio(e.orgId, e.objetoId, tipo, await comNumeros(previous));
  } else if (e.objeto === "contact") {
    // O diff vem das fotos internas (valor gravado): no webhook sai em inglês, como o `data`.
    if (previous && typeof previous.lead_stage === "string") previous.lead_stage = toPublic(LEAD_STAGE, previous.lead_stage);
    if (previous && typeof previous.source === "string") previous.source = toPublic(CONTACT_SOURCE, previous.source);
    // Etiqueta adicionada/removida: diz qual (sem isso o evento não serve pra nada).
    const tagId = (tipo === "contact.tag_added" || tipo === "contact.tag_removed") && typeof e.dados.tag_id === "string" ? e.dados.tag_id : null;
    if (tagId) await emitirEventoDeContato(e.orgId, e.objetoId, tipo, previous, tagId);
    else await emitirEventoDeContato(e.orgId, e.objetoId, tipo, previous);
  }
  else if (e.objeto === "company") await emitirEventoDeEmpresa(e.orgId, e.objetoId, tipo, previous);
  else if (e.objeto === "task") await emitirEventoDeTarefa(e.orgId, e.objetoId, tipo);
}
