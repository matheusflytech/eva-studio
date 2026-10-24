import { describe, it, expect } from "vitest";
import { comCitacao, desembrulhar, textoDaMensagem, trechoCitado } from "./tipos.js";

describe("tipos de mensagem do QR", () => {
  it("desembrulha temporária e visualização única", () => {
    const m = { ephemeralMessage: { message: { viewOnceMessageV2: { message: { imageMessage: { caption: "olha" } } } } } };
    expect(textoDaMensagem(desembrulhar(m))).toBe("olha");
  });

  it("localização, contato e reação viram texto como na Meta", () => {
    expect(textoDaMensagem({ locationMessage: { degreesLatitude: -26.9, degreesLongitude: -48.6, name: "Loja" } })).toBe(
      "[Localização] Loja https://maps.google.com/?q=-26.9,-48.6"
    );
    expect(
      textoDaMensagem({ contactMessage: { displayName: "Ana", vcard: "BEGIN:VCARD\nTEL;type=CELL;waid=5547999990001:+55 47 99999-0001\nEND:VCARD" } })
    ).toBe("[Contato compartilhado] Ana 5547999990001");
    expect(textoDaMensagem({ reactionMessage: { text: "👍" } })).toBe("[Reação: 👍]");
    expect(textoDaMensagem({ reactionMessage: { text: "" } })).toBeNull(); // tirou a reação
  });

  it("citação: trecho da mensagem respondida vai antes do texto", () => {
    const m = { extendedTextMessage: { text: "esse mesmo", contextInfo: { quotedMessage: { conversation: "Temos o plano Pro e o Básico" } } } };
    expect(comCitacao(trechoCitado(m), textoDaMensagem(m))).toBe("Respondendo a: «Temos o plano Pro e o Básico»\nesse mesmo");
    expect(comCitacao(trechoCitado({ conversation: "oi" }), "oi")).toBe("oi");
  });
});
