import { describe, expect, it } from "vitest";
import { partesDoTrecho, trechoComDestaque } from "./trecho";

describe("trechoComDestaque", () => {
  it("destaca o termo ignorando acento e caixa, nas posições do texto original", () => {
    const t = trechoComDestaque("Cliente pediu PROPOSTA nova até sexta", ["proposta", "ate"]);
    expect(t.texto).toBe("Cliente pediu PROPOSTA nova até sexta");
    const marcados = t.destaques.map(([a, b]) => t.texto.slice(a, b));
    expect(marcados).toEqual(["PROPOSTA", "até"]);
  });

  it("só destaca começo de palavra (como a busca)", () => {
    const t = trechoComDestaque("o caso do acaso", ["caso"]);
    expect(t.destaques.map(([a, b]) => t.texto.slice(a, b))).toEqual(["caso"]);
  });

  it("texto longo: corta em volta do primeiro achado, com reticências", () => {
    const longo = `${"palavra ".repeat(30)}orçamento aprovado ${"fim ".repeat(30)}`;
    const t = trechoComDestaque(longo, ["orcamento"], 30);
    expect(t.texto.startsWith("…")).toBe(true);
    expect(t.texto.endsWith("…")).toBe(true);
    expect(t.texto.length).toBeLessThan(longo.length);
    const [[a, b]] = t.destaques;
    expect(t.texto.slice(a, b)).toBe("orçamento");
  });

  it("sem achado: começo do texto, sem destaque; quebra de linha vira espaço", () => {
    const t = trechoComDestaque("linha um\nlinha dois", ["xyz"]);
    expect(t.texto).toBe("linha um linha dois");
    expect(t.destaques).toEqual([]);
  });

  it("texto decomposto (NFD) mantém as posições certas", () => {
    const t = trechoComDestaque("José Maria", ["maria"]);
    const [[a, b]] = t.destaques;
    expect(t.texto.slice(a, b)).toBe("Maria");
  });
});

describe("partesDoTrecho", () => {
  it("divide em pedaços marcados e não marcados", () => {
    expect(partesDoTrecho({ texto: "ab cd ef", destaques: [[3, 5]] })).toEqual([
      { texto: "ab ", marcado: false },
      { texto: "cd", marcado: true },
      { texto: " ef", marcado: false },
    ]);
  });
});
