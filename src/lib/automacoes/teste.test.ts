import { describe, it, expect } from "vitest";
import { exemploProposta } from "./exemplo.test-helpers";
import { planoDoTeste } from "./teste";
import { definicaoVazia, type Definicao } from "./tipos";

describe("planoDoTeste", () => {
  it("fluxo com WhatsApp pede o número; mostra o que vai fazer", () => {
    const p = planoDoTeste(exemploProposta());
    expect(p.precisaWhatsApp).toBe(true);
    expect(p.precisaEmail).toBe(false);
    expect(p.oQueFaz[0]).toBe("criar um negócio de teste");
    expect(p.oQueFaz.length).toBeGreaterThan(1);
  });

  it("fluxo só com n8n não pede número nem e-mail", () => {
    const def: Definicao = {
      ...definicaoVazia("conversation"),
      gatilho: { tipo: "message.received", config: { modo: "primeira" } },
      inicio: "n8n",
      nos: { n8n: { id: "n8n", tipo: "acao", acao: "n8n.webhook", config: { url: "https://n8n.exemplo.com/webhook/x" }, proximo: null } },
    };
    const p = planoDoTeste(def);
    expect(p).toMatchObject({ precisaWhatsApp: false, precisaEmail: false });
    expect(p.oQueFaz).toEqual(["criar uma conversa de teste", "Enviar para o n8n"]);
  });
});
