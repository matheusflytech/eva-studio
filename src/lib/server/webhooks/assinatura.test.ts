import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import crypto from "node:crypto";
import { assinar, assinaturaConfere, headersAssinados, novoSegredo } from "./assinatura";

describe("Standard Webhooks", () => {
  it("bate com o exemplo da especificação (standardwebhooks.com)", () => {
    // Vetor oficial: segredo, id, timestamp e corpo do README da especificação.
    const segredo = "whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw";
    const corpo = '{"test": 2432232314}';
    expect(assinar(segredo, "msg_p5jXN8AQM9LWM0D4loKWxJek", 1614265330, corpo)).toBe("v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE=");
  });

  it("segredo novo tem o prefixo e 24 bytes", () => {
    const s = novoSegredo();
    expect(s.startsWith("whsec_")).toBe(true);
    expect(Buffer.from(s.slice(6), "base64")).toHaveLength(24);
  });

  it("confere o que assinou; recusa corpo mexido, segredo errado e horário velho", () => {
    const segredo = novoSegredo();
    const agora = new Date("2026-10-23T12:00:00Z");
    const h = headersAssinados(segredo, "msg_1", '{"a":1}', agora);
    const lido = { id: h["webhook-id"], timestamp: h["webhook-timestamp"], signature: h["webhook-signature"] };
    expect(assinaturaConfere(segredo, lido, '{"a":1}', agora)).toBe(true);
    expect(assinaturaConfere(segredo, lido, '{"a":2}', agora)).toBe(false);
    expect(assinaturaConfere(novoSegredo(), lido, '{"a":1}', agora)).toBe(false);
    expect(assinaturaConfere(segredo, lido, '{"a":1}', new Date(agora.getTime() + 6 * 60_000))).toBe(false);
  });

  it("aceita várias assinaturas no header (rotação de segredo)", () => {
    const segredo = novoSegredo();
    const agora = new Date();
    const h = headersAssinados(segredo, "msg_2", "x", agora);
    const outra = `v1,${crypto.randomBytes(32).toString("base64")}`;
    expect(assinaturaConfere(segredo, { id: "msg_2", timestamp: h["webhook-timestamp"], signature: `${outra} ${h["webhook-signature"]}` }, "x", agora)).toBe(true);
  });
});
