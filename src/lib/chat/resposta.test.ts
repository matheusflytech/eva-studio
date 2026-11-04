import { describe, expect, it } from "vitest";
import { blocosDaResposta, destacarNumeros, separarSugestoes } from "./resposta";

describe("destacarNumeros", () => {
  it("marca dinheiro, porcentagem, número e data inteiros", () => {
    expect(destacarNumeros("Receita de R$ 18.755,85 em 04/11/2026: 12 negócios (35%)")).toEqual([
      { texto: "Receita de ", destaque: false },
      { texto: "R$ 18.755,85", destaque: true },
      { texto: " em ", destaque: false },
      { texto: "04/11/2026", destaque: true },
      { texto: ": ", destaque: false },
      { texto: "12", destaque: true },
      { texto: " negócios (", destaque: false },
      { texto: "35%", destaque: true },
      { texto: ")", destaque: false },
    ]);
  });

  it("texto sem número fica inteiro, e vazio não gera partes", () => {
    expect(destacarNumeros("sem dados")).toEqual([{ texto: "sem dados", destaque: false }]);
    expect(destacarNumeros("")).toEqual([]);
  });
});

describe("blocosDaResposta", () => {
  it("separa parágrafo, itens com rótulo e itens simples", () => {
    const b = blocosDaResposta("Funil de vendas:\n- Novo: 1 negócio\n- sem rótulo 3\n\nTotal: 2");
    expect(b.map((x) => x.tipo)).toEqual(["p", "item", "item", "espaco", "p"]);
    expect(b[1]).toMatchObject({ rotulo: "Novo" });
    expect(b[2]).toMatchObject({ rotulo: null });
  });

  it("aceita lista numerada e marcadores comuns", () => {
    const b = blocosDaResposta("1. Ana: 3\n• Bia: 2\n* Caio: 1");
    expect(b.every((x) => x.tipo === "item")).toBe(true);
  });

  it("tira markdown, não deixa espaço no fim e não cria dois espaços seguidos", () => {
    const b = blocosDaResposta("## Resumo\n**Total** de `5`\n\n\n\n- a: 1\n\n");
    expect(b.map((x) => x.tipo)).toEqual(["p", "p", "espaco", "item"]);
    expect(JSON.stringify(b[0])).not.toContain("#");
    expect(JSON.stringify(b[1])).not.toContain("*");
  });

  it("dois pontos longe do começo não viram rótulo", () => {
    const b = blocosDaResposta("- uma frase bem longa que passa de quarenta e oito letras antes dos dois pontos: 5");
    expect(b[0]).toMatchObject({ rotulo: null });
  });
});

describe("separarSugestoes", () => {
  it("tira a linha SUGESTOES do texto e devolve até 3 perguntas", () => {
    const r = separarSugestoes("Funil: 3 negócios.\nSUGESTOES: Mostre em gráfico | Compare com o mês passado | Quais estão parados? | quarta que sobra");
    expect(r.texto).toBe("Funil: 3 negócios.");
    expect(r.sugestoes).toEqual(["Mostre em gráfico", "Compare com o mês passado", "Quais estão parados?"]);
  });
  it("aceita acento e negrito; sem a linha, não muda nada", () => {
    expect(separarSugestoes("Oi.\n**Sugestões:** Uma pergunta aqui | Outra pergunta aqui").sugestoes).toHaveLength(2);
    expect(separarSugestoes("Só texto.")).toEqual({ texto: "Só texto.", sugestoes: [] });
  });
});
