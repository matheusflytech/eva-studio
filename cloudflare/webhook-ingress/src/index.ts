import { tratarLote } from "./consumidor";
import { tratarEntrada } from "./entrada";
import type { ContextoDeExecucao, EnvelopeDeWebhook, Env, LoteDaFila } from "./tipos";

// Worker de entrada de webhooks do Eva Studio.
//   fetch → valida assinatura, deduplica (KV), enfileira (Queue), responde 200.
//   queue → entrega ao app em /api/internal/webhooks com HMAC, retry e DLQ.
const worker = {
  fetch(request: Request, env: Env, ctx: ContextoDeExecucao): Promise<Response> {
    return tratarEntrada(request, env, ctx);
  },
  queue(lote: LoteDaFila<EnvelopeDeWebhook>, env: Env): Promise<void> {
    return tratarLote(lote, env);
  },
};

export default worker;
