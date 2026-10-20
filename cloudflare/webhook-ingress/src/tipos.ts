// Tipos mínimos dos bindings que o Worker usa.
//
// Por que não usar direto os globais de @cloudflare/workers-types: o tsconfig
// da raiz do app inclui "**/*.ts", então este código também é checado pelo
// `tsc` do Next (com a lib "dom", sem os tipos da Cloudflare). Interfaces
// estruturais pequenas funcionam nos dois lados e são compatíveis com os
// objetos reais (KVNamespace, Queue, MessageBatch, ExecutionContext).

export type Origem = "meta" | "telegram" | "tiktok";

/** O que vai para a fila e, depois, para o app. Corpo cru preservado byte a byte. */
export interface EnvelopeDeWebhook {
  v: 1;
  /** Chave de dedupe (também vira o id estável entre tentativas). */
  id: string;
  origem: Origem;
  /** Telegram e TikTok: o agente vem na URL. Meta: descoberto pelo payload no app. */
  agentId?: string;
  recebidoEm: string;
  /** Corpo exatamente como chegou: a assinatura da Meta é sobre esses bytes. */
  corpo: string;
  /** Só o que o app precisa para revalidar (assinatura da Meta não é segredo). */
  cabecalhos: { "x-hub-signature-256"?: string };
}

export interface KvMinimo {
  get(chave: string): Promise<string | null>;
  put(chave: string, valor: string, opcoes?: { expirationTtl?: number }): Promise<void>;
}

export interface FilaMinima<T> {
  send(corpo: T, opcoes?: { delaySeconds?: number }): Promise<void>;
}

export interface MensagemDaFila<T> {
  readonly id: string;
  readonly body: T;
  readonly attempts: number;
  ack(): void;
  retry(opcoes?: { delaySeconds?: number }): void;
}

export interface LoteDaFila<T> {
  readonly queue: string;
  readonly messages: readonly MensagemDaFila<T>[];
}

export interface ContextoDeExecucao {
  waitUntil(promessa: Promise<unknown>): void;
}

export interface Env {
  APP_URL: string;
  DEDUPE: KvMinimo;
  FILA_ENTRADA: FilaMinima<EnvelopeDeWebhook>;
  FILA_MORTA: FilaMinima<EnvelopeDeWebhook>;
  // Segredos (wrangler secret put):
  META_APP_SECRET?: string;
  META_WEBHOOK_VERIFY_TOKEN?: string;
  TELEGRAM_SECRET_TOKEN?: string;
  TIKTOK_WEBHOOK_TOKEN?: string;
  INGRESS_SIGNING_SECRET?: string;
}
