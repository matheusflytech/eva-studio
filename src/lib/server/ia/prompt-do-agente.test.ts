import { describe, it, expect } from "vitest";
import { contextoDaConversa } from "./prompt-do-agente";

describe("contextoDaConversa", () => {
  const agora = new Date("2026-10-24T21:40:00.000Z"); // 18:40 em São Paulo

  it("leva hora de Brasília, canal, nome e o formato de WhatsApp", () => {
    const c = contextoDaConversa({ canal: "whatsapp_qr", nome: "Rafael", agora });
    expect(c).toContain("18:40");
    expect(c).toContain("Canal: WhatsApp.");
    expect(c).toContain("Nome do contato: Rafael.");
    expect(c).toContain("Uma pergunta por vez.");
  });

  it("grupo, nome que é só número e canal fora do WhatsApp", () => {
    expect(contextoDaConversa({ canal: "whatsapp_qr", grupo: true, agora })).toContain("Canal: grupo de WhatsApp.");
    expect(contextoDaConversa({ canal: "website", nome: "5547999990001", agora })).not.toContain("Nome do contato");
    expect(contextoDaConversa({ canal: "website", agora })).toContain("nada de markdown");
  });
});

describe("contextoDaConversa no grupo", () => {
  it("diz quem chamou o agente para a IA responder a essa pessoa", () => {
    const c = contextoDaConversa({ canal: "whatsapp_qr", grupo: true, autor: "Matheus", agora: new Date() });
    expect(c).toContain("Quem chamou você agora: Matheus.");
    expect(contextoDaConversa({ canal: "whatsapp_qr", autor: "Matheus", agora: new Date() })).not.toContain("Quem chamou");
  });
});
