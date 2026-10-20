import { describe, expect, it } from "vitest";
import { agruparCaminhos, emBlocos, lerPedidoDeLote, textoDaPrevia } from "./lote";

describe("pedido de lote", () => {
  it("ids OU filtro, nunca os dois nem nenhum", () => {
    expect(lerPedidoDeLote({ acao: "atribuir" }, "contatos")).toMatch(/ids escolhidos OU o filtro/);
    expect(lerPedidoDeLote({ acao: "atribuir", ids: ["a"], filtro: {} }, "contatos")).toMatch(/não os dois/);
    expect(lerPedidoDeLote({ acao: "atribuir", ids: ["a", "a", "<x>"] }, "contatos")).toMatchObject({ ids: ["a"], filtro: null });
    expect(lerPedidoDeLote({ acao: "atribuir", filtro: { busca: "x" }, simular: true }, "contatos")).toMatchObject({ ids: null, filtro: { busca: "x" }, simular: true });
  });

  it("ação de outra lista é recusada", () => {
    expect(lerPedidoDeLote({ acao: "mover", ids: ["a"] }, "contatos")).toBe("Ação inválida.");
    expect(lerPedidoDeLote({ acao: "sequencia", ids: ["a"] }, "negocios")).toBe("Ação inválida.");
  });

  it("acima do limite → erro; desfazer não precisa de alvo", () => {
    expect(lerPedidoDeLote({ acao: "arquivar", ids: Array.from({ length: 5001 }, (_, i) => `d${i}`) }, "negocios")).toMatch(/5\.000/);
    expect(lerPedidoDeLote({ acao: "restaurar_lixeira", parametros: { trashIds: ["t"] } }, "negocios")).toMatchObject({ acao: "restaurar_lixeira" });
  });
});

describe("prévia", () => {
  it("frase com caminhos, bloqueados e sem mudança", () => {
    const caminhos = agruparCaminhos([
      ...Array.from({ length: 12 }, () => ({ de: "Proposta", para: "Negociação" })),
      { de: "Novo", para: "Negociação" },
    ]);
    const falhas = [1, 2, 3].map((i) => ({ id: `d${i}`, nome: "", motivo: "", codigo: "campos_obrigatorios" }));
    expect(textoDaPrevia({ ok: 13, ignorados: 2, falhas, previa: { caminhos, mudam: 13, jaEstavam: 2 } }, "negocios")).toBe(
      "12 negócios vão de Proposta → Negociação; 1 negócio vai de Novo → Negociação; 3 bloqueados por campos obrigatórios; 2 sem mudança"
    );
    expect(textoDaPrevia({ ok: 1, ignorados: 0, falhas: [] }, "contatos")).toBe("1 contato muda");
  });

  it("blocos", () => {
    expect(emBlocos([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});
