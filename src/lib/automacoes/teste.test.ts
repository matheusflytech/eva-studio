import { describe, it, expect } from "vitest";
import { exemploProposta } from "./exemplo.test-helpers";
import { motivoDoPasso, passosComProblema, planoDoTeste } from "./teste";
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

describe("motivo do passo", () => {
  it("falhou: o erro; sem erro, avisa que falhou sem dizer", () => {
    expect(motivoDoPasso({ noId: "z", status: "falhou", erro: "número inválido" })).toBe("número inválido");
    expect(motivoDoPasso({ noId: "z", status: "falhou", erro: "  " })).toBe("Falhou sem dizer o motivo.");
  });

  it("pulado e esperando: o motivo gravado na saída", () => {
    expect(motivoDoPasso({ noId: "z", status: "pulado", saida: { motivo: "o contato não aceita mensagens" } })).toBe("Pulado: o contato não aceita mensagens.");
    const m = motivoDoPasso({ noId: "z", status: "esperando", saida: { motivo: "fora do horário comercial", ate: "2026-10-26T11:00:00.000Z" } });
    expect(m).toMatch(/^Fora do horário comercial \(continua .*08:00\)\.$/);
  });

  it("deu certo ou espera comum: nada a explicar", () => {
    expect(motivoDoPasso({ noId: "z", status: "ok", saida: { feito: 1 } })).toBeNull();
    expect(motivoDoPasso({ noId: "z", status: "esperando", saida: {} })).toBeNull();
    expect(passosComProblema([{ noId: "a", status: "ok" }, { noId: "b", status: "falhou", erro: "x" }]).map((p) => [p.passo.noId, p.motivo])).toEqual([["b", "x"]]);
  });
});
