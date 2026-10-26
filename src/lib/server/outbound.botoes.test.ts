import { describe, it, expect } from "vitest";
import { comBotoes, corpoDoCarrossel } from "./outbound";

describe("corpoDoCarrossel (Instagram e Messenger)", () => {
  it("modelo genérico com botões de link, respeitando 10 cards, 3 botões e os tamanhos", () => {
    const cards = Array.from({ length: 12 }, (_, i) => ({
      title: `Card ${i} ${"x".repeat(90)}`,
      buttons: Array.from({ length: 4 }, (_, j) => ({ label: `Botão ${j} comprido demais`, url: `https://e.com/${j}` })),
    }));
    const el = corpoDoCarrossel(cards).attachment.payload.elements;
    expect(el).toHaveLength(10);
    expect(el[0].title).toHaveLength(80);
    expect(el[0].buttons).toHaveLength(3);
    expect(el[0].buttons?.[0]).toEqual({ type: "web_url", url: "https://e.com/0", title: "Botão 0 comprido dem" });
    expect(el[0]).not.toHaveProperty("image_url");
  });
});

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
