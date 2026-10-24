import { describe, it, expect, afterEach } from "vitest";
import { tokenDoWebhookTikTok, tokenDoWebhookTikTokConfere } from "./tiktok-token";

const original = process.env.INTERNAL_API_SECRET;
afterEach(() => {
  process.env.INTERNAL_API_SECRET = original;
});

describe("token do webhook do TikTok", () => {
  it("nunca é o segredo interno e muda por escopo", () => {
    process.env.INTERNAL_API_SECRET = "segredo-mestre";
    const a = tokenDoWebhookTikTok("agente:a1");
    expect(a).not.toContain("segredo-mestre");
    expect(a).not.toBe(tokenDoWebhookTikTok("agente:a2"));
    expect(a).not.toBe(tokenDoWebhookTikTok("canal:a1"));
  });

  it("confere só o token do próprio escopo; o segredo interno não serve mais", () => {
    process.env.INTERNAL_API_SECRET = "segredo-mestre";
    const a = tokenDoWebhookTikTok("agente:a1");
    expect(tokenDoWebhookTikTokConfere("agente:a1", a)).toBe(true);
    expect(tokenDoWebhookTikTokConfere("agente:a2", a)).toBe(false);
    expect(tokenDoWebhookTikTokConfere("agente:a1", "segredo-mestre")).toBe(false);
    expect(tokenDoWebhookTikTokConfere("agente:a1", null)).toBe(false);
  });

  it("sem segredo configurado (dev local) não confere nada, como antes", () => {
    delete process.env.INTERNAL_API_SECRET;
    expect(tokenDoWebhookTikTok("agente:a1")).toBeNull();
    expect(tokenDoWebhookTikTokConfere("agente:a1", null)).toBe(true);
  });
});
