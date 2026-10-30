import { describe, expect, it } from "vitest";
import { mensagemDeFalhaDaIa } from "./falha-do-provedor";

describe("mensagemDeFalhaDaIa", () => {
  const m = (erro?: string) => mensagemDeFalhaDaIa("groq", "llama-3.3-70b-versatile", erro);

  it("diz o motivo pelo status do provedor", () => {
    expect(m('groq 401: {"error":{"code":"invalid_api_key"}}')).toMatch(/Groq recusou a chave/);
    expect(m("groq 403: forbidden")).toMatch(/recusou a chave/);
    expect(m("groq 404: model_not_found")).toMatch(/llama-3.3-70b-versatile não está liberado/);
    expect(m("groq 400: The model `x` does not exist")).toMatch(/não está liberado/);
    expect(m("groq 429: rate limit")).toMatch(/limite de uso/);
    expect(m("groq 413: request too large")).toMatch(/grande demais/);
    expect(m("groq 503: overloaded")).toMatch(/instável/);
    expect(m("Groq demorou mais de 30 s para responder.")).toMatch(/demorou demais/);
  });

  it("sem pista, cai na frase genérica e nunca ecoa o corpo", () => {
    expect(m(undefined)).toMatch(/não conseguiu responder/);
    expect(m("groq 400: gsk_segredo")).not.toContain("gsk_");
  });
});
