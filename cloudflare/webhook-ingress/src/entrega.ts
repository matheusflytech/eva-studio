import { assinarParaOApp } from "./assinatura";
import type { EnvelopeDeWebhook } from "./tipos";

export const CAMINHO_INTERNO = "/api/internal/webhooks";

// O app roda o motor de fluxo (pode chamar LLM). Acima disso, desiste e a
// fila re-tenta; o app tem dedupe por id de mensagem na rota da Meta.
export const TIMEOUT_ENTREGA_MS = 60_000;

export type ResultadoDaEntrega =
  | { tipo: "ok"; status: number }
  /** Vale tentar de novo (rede, timeout, 408/425/429/5xx). */
  | { tipo: "tentar_de_novo"; status?: number; esperarSegundos?: number; erro?: string }
  /** Nunca vai dar certo repetindo igual (4xx): vai para a fila morta. */
  | { tipo: "desistir"; status: number; erro?: string };

export function classificarResposta(status: number, retryAfter: string | null): ResultadoDaEntrega {
  if (status >= 200 && status < 300) return { tipo: "ok", status };
  if (status === 408 || status === 425 || status === 429 || status >= 500) {
    const s = retryAfter ? Number.parseInt(retryAfter, 10) : NaN;
    return { tipo: "tentar_de_novo", status, esperarSegundos: Number.isFinite(s) && s > 0 ? s : undefined };
  }
  return { tipo: "desistir", status };
}

/** Entrega um envelope ao app, assinado com o segredo compartilhado. */
export async function entregarAoApp(
  appUrl: string,
  segredo: string,
  envelope: EnvelopeDeWebhook,
  agora: () => number = Date.now,
  buscar: typeof fetch = fetch
): Promise<ResultadoDaEntrega> {
  const corpo = JSON.stringify(envelope);
  const timestamp = Math.floor(agora() / 1000);
  const assinatura = await assinarParaOApp(segredo, timestamp, corpo);
  try {
    const res = await buscar(new URL(CAMINHO_INTERNO, appUrl).toString(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-eva-event-id": envelope.id,
        "x-eva-timestamp": String(timestamp),
        "x-eva-signature": assinatura,
      },
      body: corpo,
      signal: AbortSignal.timeout(TIMEOUT_ENTREGA_MS),
    });
    const r = classificarResposta(res.status, res.headers.get("retry-after"));
    if (r.tipo !== "ok") {
      const texto = (await res.text().catch(() => "")).slice(0, 300);
      return { ...r, erro: texto };
    }
    return r;
  } catch (e) {
    return { tipo: "tentar_de_novo", erro: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Espera antes da próxima tentativa: 30 s, 1 min, 2 min, 4 min… até 1 h, com
 * até 20% de variação para não acordar tudo junto depois de uma queda do app.
 * Com max_retries 20 no wrangler.jsonc, cobre ~15 h antes da fila morta.
 */
export function esperaExponencial(tentativa: number, sorteio: () => number = Math.random): number {
  const base = Math.min(30 * 2 ** Math.max(0, tentativa - 1), 3600);
  return Math.round(base * (1 + sorteio() * 0.2));
}
