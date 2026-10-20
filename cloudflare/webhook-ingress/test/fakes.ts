import type { ContextoDeExecucao, EnvelopeDeWebhook, Env, KvMinimo, MensagemDaFila } from "../src/tipos";

// Bindings em memória: os testes rodam no workerd, mas sem depender de KV e
// Queue reais (e sem que o tsc da raiz do app precise conhecer cloudflare:*).

export class KvFalso implements KvMinimo {
  dados = new Map<string, { valor: string; ttl?: number }>();
  async get(chave: string) {
    return this.dados.get(chave)?.valor ?? null;
  }
  async put(chave: string, valor: string, opcoes?: { expirationTtl?: number }) {
    this.dados.set(chave, { valor, ttl: opcoes?.expirationTtl });
  }
}

export class FilaFalsa {
  enviados: EnvelopeDeWebhook[] = [];
  falhar = false;
  async send(corpo: EnvelopeDeWebhook) {
    if (this.falhar) throw new Error("fila fora");
    this.enviados.push(corpo);
  }
}

export function ambiente(extra: Partial<Env> = {}): Env & { DEDUPE: KvFalso; FILA_ENTRADA: FilaFalsa; FILA_MORTA: FilaFalsa } {
  return {
    APP_URL: "https://app.eva.test",
    DEDUPE: new KvFalso(),
    FILA_ENTRADA: new FilaFalsa(),
    FILA_MORTA: new FilaFalsa(),
    META_APP_SECRET: "segredo-meta",
    META_WEBHOOK_VERIFY_TOKEN: "verifica",
    TELEGRAM_SECRET_TOKEN: "segredo-tg",
    TIKTOK_WEBHOOK_TOKEN: "segredo-tt",
    INGRESS_SIGNING_SECRET: "segredo-app",
    ...extra,
  } as Env & { DEDUPE: KvFalso; FILA_ENTRADA: FilaFalsa; FILA_MORTA: FilaFalsa };
}

export function contexto(): ContextoDeExecucao & { pendentes: Promise<unknown>[]; esperar(): Promise<void> } {
  const pendentes: Promise<unknown>[] = [];
  return {
    pendentes,
    waitUntil(p) {
      pendentes.push(p);
    },
    async esperar() {
      await Promise.all(pendentes);
    },
  };
}

export function mensagem(body: EnvelopeDeWebhook, attempts = 1) {
  const m = {
    id: "msg-1",
    body,
    attempts,
    acked: false,
    retried: undefined as undefined | { delaySeconds?: number },
    ack() {
      m.acked = true;
    },
    retry(opcoes?: { delaySeconds?: number }) {
      m.retried = opcoes ?? {};
    },
  };
  return m satisfies MensagemDaFila<EnvelopeDeWebhook>;
}
