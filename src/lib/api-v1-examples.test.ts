import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { WEBHOOK_VERIFY_SNIPPET, exampleUrl, toCurl, toFetch } from "./api-v1-examples";
import { headersAssinados, novoSegredo } from "./server/webhooks/assinatura";

describe("trecho de conferência do webhook mostrado na página", () => {
  // Roda o texto do exemplo (sem os import/export de módulo) como função.
  const verifyWebhook = new Function(
    "crypto",
    "Buffer",
    "process",
    WEBHOOK_VERIFY_SNIPPET.replace(/^import .*$/m, "").replace("export function", "function") + "\nreturn verifyWebhook;"
  )(crypto, Buffer, { env: {} }) as (corpo: string, headers: Record<string, string>, segredo: string) => boolean;

  it("aceita a assinatura que o Eva Studio gera e recusa corpo alterado ou segredo errado", () => {
    const segredo = novoSegredo();
    const corpo = JSON.stringify({ id: "evt_1", type: "deal.won", timestamp: new Date().toISOString(), data: {} });
    const headers = headersAssinados(segredo, "msg_1", corpo);
    expect(verifyWebhook(corpo, headers, segredo)).toBe(true);
    expect(verifyWebhook(corpo + " ", headers, segredo)).toBe(false);
    expect(verifyWebhook(corpo, headers, novoSegredo())).toBe(false);
  });

  it("recusa timestamp com mais de 5 minutos", () => {
    const segredo = novoSegredo();
    const headers = headersAssinados(segredo, "msg_1", "{}", new Date(Date.now() - 10 * 60 * 1000));
    expect(verifyWebhook("{}", headers, segredo)).toBe(false);
  });
});

describe("exemplos da API v1", () => {
  it("curl escapa aspas simples do corpo e põe Idempotency-Key quando pedido", () => {
    const curl = toCurl({ method: "POST", url: "https://x/api/v1/notes", body: { text: "d'água" }, idempotency: true });
    expect(curl).toContain(`-H "Idempotency-Key: $(uuidgen)"`);
    expect(curl).toContain(`"text": "d'\\''água"`);
  });

  it("fetch sem corpo não manda Content-Type nem body", () => {
    const js = toFetch({ method: "GET", url: "https://x/api/v1/me" });
    expect(js).not.toContain("Content-Type");
    expect(js).not.toContain("body:");
    expect(js).toContain(`method: "GET"`);
  });

  it("fetch com corpo gera JavaScript válido", () => {
    const js = toFetch({ method: "PATCH", url: "https://x/api/v1/deals/1", body: { amount_cents: 100, tags: ["a"] }, idempotency: true });
    // Compila (sem rodar): troca o await de topo por uma função async.
    expect(() => new Function(`return (async () => { ${js} })`)).not.toThrow();
  });

  it("exampleUrl troca só os parâmetros conhecidos", () => {
    expect(exampleUrl("/api/v1", "/pipelines/{id}/stages/{stageId}", { id: "1" })).toBe("/api/v1/pipelines/1/stages/{stageId}");
  });
});
