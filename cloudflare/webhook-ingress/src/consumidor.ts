import { entregarAoApp, esperaExponencial } from "./entrega";
import type { EnvelopeDeWebhook, Env, LoteDaFila } from "./tipos";

/**
 * Consumidor da fila: entrega cada envelope ao app.
 *
 * - 2xx: ack.
 * - rede/timeout/408/425/429/5xx: retry com espera exponencial (ou Retry-After);
 *   esgotado max_retries, a própria Queues manda para a fila morta (DLQ).
 * - outro 4xx (assinatura recusada, envelope inválido): repetir igual não
 *   resolve — vai direto para a fila morta e sai da principal.
 *
 * Um envelope por vez dentro do lote: mantém a ordem aproximada de chegada
 * para o mesmo contato e não martela o app em paralelo.
 */
export async function tratarLote(lote: LoteDaFila<EnvelopeDeWebhook>, env: Env): Promise<void> {
  const segredo = env.INGRESS_SIGNING_SECRET;
  for (const msg of lote.messages) {
    if (!segredo) {
      // Sem segredo não há como entregar; segura na fila até configurarem.
      msg.retry({ delaySeconds: 300 });
      continue;
    }
    const r = await entregarAoApp(env.APP_URL, segredo, msg.body);
    if (r.tipo === "ok") {
      msg.ack();
    } else if (r.tipo === "tentar_de_novo") {
      const espera = r.esperarSegundos ?? esperaExponencial(msg.attempts);
      console.warn("[fila] retry", msg.body.id, r.status ?? "rede", r.erro ?? "", `tentativa ${msg.attempts}`, `${espera}s`);
      msg.retry({ delaySeconds: Math.min(espera, 86_400) });
    } else {
      console.error("[fila] desistiu", msg.body.id, r.status, r.erro ?? "");
      try {
        await env.FILA_MORTA.send(msg.body);
        msg.ack();
      } catch {
        // Fila morta indisponível: retry normal, que acaba nela pelo max_retries.
        msg.retry({ delaySeconds: esperaExponencial(msg.attempts) });
      }
    }
  }
}
