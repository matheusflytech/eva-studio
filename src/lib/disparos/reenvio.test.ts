import { describe, it, expect } from "vitest";
import { chaveDoDestino, quemReenviar } from "./reenvio";

describe("chaveDoDestino", () => {
  it("mesma pessoa com ou sem nono dígito, DDI ou jid", () => {
    const k = chaveDoDestino("5511999990001@s.whatsapp.net");
    expect(chaveDoDestino("551199990001")).toBe(k);
    expect(chaveDoDestino("11999990001")).toBe(k);
    expect(chaveDoDestino("+55 (11) 99999-0001")).toBe(k);
    expect(chaveDoDestino("5511999990002")).not.toBe(k);
  });
  it("grupo e @lid ficam como estão", () => {
    expect(chaveDoDestino("120363000000@g.us")).toBe("120363000000@g.us");
    expect(chaveDoDestino("abc@lid")).toBe("abc@lid");
  });
});

describe("quemReenviar", () => {
  it("tira quem já recebeu, quem não tem WhatsApp e repetidos", () => {
    const r = quemReenviar(
      [
        { contactId: "5511999990001@s.whatsapp.net", error: "O chip foi desconectado" },
        { contactId: "551199990001@s.whatsapp.net", error: "O chip foi desconectado" },
        { contactId: "5511999990002@s.whatsapp.net", error: "Número sem WhatsApp" },
        { contactId: "5511999990003@s.whatsapp.net", error: "timeout" },
      ],
      ["551199990003@s.whatsapp.net"]
    );
    expect(r).toEqual({ destinos: ["5511999990001@s.whatsapp.net"], semWhatsApp: 1, jaReceberam: 1 });
  });
});
