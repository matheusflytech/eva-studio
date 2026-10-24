import { describe, it, expect } from "vitest";
import { analisarMensagem, usuarioDoJid } from "./contato.js";

const eu = { id: "5511999990001:12@s.whatsapp.net", lid: "987654321098765:12@lid" };
const grupo = (message: object) => ({ key: { remoteJid: "120363408777803125@g.us" }, message });

describe("analisarMensagem", () => {
  it("conversa 1:1 pelo número: o próprio JID, agente responde", () => {
    expect(analisarMensagem({ key: { remoteJid: "5547999705773@s.whatsapp.net" } }, eu)).toEqual({ contato: "5547999705773@s.whatsapp.net", grupo: false, responder: true });
  });

  it("@lid com o número junto vira o número; sem ele, fica o lid", () => {
    expect(analisarMensagem({ key: { remoteJid: "123456789012345@lid", senderPn: "5547999705773@s.whatsapp.net" } }, eu)?.contato).toBe("5547999705773@s.whatsapp.net");
    expect(analisarMensagem({ key: { remoteJid: "123456789012345@lid" } }, eu)?.contato).toBe("123456789012345@lid");
  });

  it("grupo sem menção: entra, mas o agente não responde", () => {
    expect(analisarMensagem(grupo({ conversation: "bom dia" }), eu)).toEqual({ contato: "120363408777803125@g.us", grupo: true, responder: false });
    expect(analisarMensagem(grupo({ extendedTextMessage: { text: "oi @ana", contextInfo: { mentionedJid: ["5511888880000@s.whatsapp.net"] } } }), eu)?.responder).toBe(false);
  });

  it("grupo: responde se marcarem o número (pelo telefone ou pelo lid) ou responderem ao agente", () => {
    expect(analisarMensagem(grupo({ extendedTextMessage: { text: "@eva", contextInfo: { mentionedJid: ["5511999990001@s.whatsapp.net"] } } }), eu)?.responder).toBe(true);
    expect(analisarMensagem(grupo({ extendedTextMessage: { text: "@eva", contextInfo: { mentionedJid: ["987654321098765@lid"] } } }), eu)?.responder).toBe(true);
    expect(analisarMensagem(grupo({ imageMessage: { caption: "e isso?", contextInfo: { participant: "5511999990001@s.whatsapp.net" } } }), eu)?.responder).toBe(true);
  });

  it("status, transmissão, canal e vazio ficam de fora", () => {
    for (const remoteJid of ["status@broadcast", "1234@broadcast", "120363@newsletter", "", null]) {
      expect(analisarMensagem({ key: { remoteJid } }, eu)).toBeNull();
    }
    expect(analisarMensagem(undefined, eu)).toBeNull();
  });
});

describe("usuarioDoJid", () => {
  it("tira aparelho e servidor", () => {
    expect(usuarioDoJid("5511999990001:12@s.whatsapp.net")).toBe("5511999990001");
    expect(usuarioDoJid(undefined)).toBe("");
  });
});
