import "server-only";
import { EVENTOS, type TipoDeEvento } from "@/lib/webhooks/eventos";
import type { EventoPublicado } from "@/lib/server/eventos/barramento";
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
    // A mensagem já vem inteira no evento (não é um objeto da API).
    await emitirEvento(e.orgId, tipo, async () => ({ data: e.dados }));
    return;
  }
  if (e.objeto === "deal") await emitirEventoDeNegocio(e.orgId, e.objetoId, tipo, previous);
  else if (e.objeto === "contact") await emitirEventoDeContato(e.orgId, e.objetoId, tipo, previous);
  else if (e.objeto === "company") await emitirEventoDeEmpresa(e.orgId, e.objetoId, tipo, previous);
  else if (e.objeto === "task") await emitirEventoDeTarefa(e.orgId, e.objetoId, tipo);
}
