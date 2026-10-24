import { describe, it, expect } from "vitest";
import { contatoDaMensagem } from "./contato.js";

describe("contatoDaMensagem", () => {
  it("conversa 1:1 pelo número é o próprio JID", () => {
    expect(contatoDaMensagem({ remoteJid: "5547999705773@s.whatsapp.net" })).toBe("5547999705773@s.whatsapp.net");
  });

  it("@lid com o número junto vira o número; sem ele, fica o lid", () => {
    expect(contatoDaMensagem({ remoteJid: "123456789012345@lid", senderPn: "5547999705773@s.whatsapp.net" })).toBe("5547999705773@s.whatsapp.net");
    expect(contatoDaMensagem({ remoteJid: "123456789012345@lid" })).toBe("123456789012345@lid");
  });

  it("grupo, status, lista de transmissão, canal e vazio não são contato", () => {
    for (const remoteJid of ["120363408777803125@g.us", "status@broadcast", "1234@broadcast", "120363@newsletter", "", null]) {
      expect(contatoDaMensagem({ remoteJid })).toBeNull();
    }
    expect(contatoDaMensagem(undefined)).toBeNull();
  });
});
