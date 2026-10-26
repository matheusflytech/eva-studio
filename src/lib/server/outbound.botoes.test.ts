import { describe, it, expect } from "vitest";
import { comBotoes } from "./outbound";

describe("comBotoes (Instagram e Messenger)", () => {
  it("sem opções: só o texto", () => {
    expect(comBotoes("Oi")).toEqual({ text: "Oi" });
  });

  it("vira quick_replies com o id no payload, respeitando 13 botões e 20 caracteres", () => {
    const opcoes = Array.from({ length: 15 }, (_, i) => ({ id: `o${i}`, label: `Opção número ${i} com nome comprido` }));
    const r = comBotoes("Escolha", opcoes);
    expect(r.quick_replies).toHaveLength(13);
    expect(r.quick_replies?.[0]).toEqual({ content_type: "text", title: "Opção número 0 com n", payload: "o0" });
  });
});
