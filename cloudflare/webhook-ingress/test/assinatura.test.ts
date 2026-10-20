import { describe, expect, it } from "vitest";
import {
  assinarParaOApp,
  hmacSha256Hex,
  iguaisEmTempoConstante,
  verificarAssinaturaMeta,
} from "../src/assinatura";

describe("assinaturas", () => {
  it("HMAC-SHA256 bate com o vetor da RFC 4231 (caso 2)", async () => {
    expect(await hmacSha256Hex("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843"
    );
  });

  it("aceita a assinatura certa da Meta e recusa as erradas", async () => {
    const corpo = '{"object":"whatsapp_business_account","entry":[]}';
    const sig = "sha256=" + (await hmacSha256Hex("app-secret", corpo));
    expect(await verificarAssinaturaMeta(corpo, sig, "app-secret")).toBe(true);
    expect(await verificarAssinaturaMeta(corpo + " ", sig, "app-secret")).toBe(false);
    expect(await verificarAssinaturaMeta(corpo, sig, "outro")).toBe(false);
    expect(await verificarAssinaturaMeta(corpo, sig.replace("sha256=", ""), "app-secret")).toBe(false);
    expect(await verificarAssinaturaMeta(corpo, null, "app-secret")).toBe(false);
    expect(await verificarAssinaturaMeta(corpo, sig, undefined)).toBe(false);
  });

  it("comparação constante trata vazio e tamanhos diferentes", () => {
    expect(iguaisEmTempoConstante("abc", "abc")).toBe(true);
    expect(iguaisEmTempoConstante("abc", "abd")).toBe(false);
    expect(iguaisEmTempoConstante("abc", "abcd")).toBe(false);
    expect(iguaisEmTempoConstante("", "")).toBe(false);
    expect(iguaisEmTempoConstante(null, "a")).toBe(false);
  });

  it("assinatura para o app inclui o timestamp", async () => {
    const a = await assinarParaOApp("s", 1000, "{}");
    const b = await assinarParaOApp("s", 1001, "{}");
    expect(a).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
    expect(a).toBe("v1=" + (await hmacSha256Hex("s", "1000.{}")));
  });
});
