import { describe, it, expect } from "vitest";
import { CARTOES_DA_VISAO, encaixeDenso, lerLayoutSalvo, painelPadrao } from "./dashboard-layout";

const fontesDaVisao = CARTOES_DA_VISAO.map((c) => c.fonte);

describe("lerLayoutSalvo", () => {
  it("layout antigo (sem altura) ganha altura pelo tipo, largura 3 vira 4 e os cartões da visão entram no topo", () => {
    const r = lerLayoutSalvo([
      { id: "a", tipo: "numero", fonte: "vendas", titulo: "Vendas", largura: 1 },
      { id: "b", tipo: "linha", fonte: "receitaPorDia", titulo: "Receita por dia", largura: 3 },
    ]);
    expect(r).toHaveLength(9);
    expect(r.slice(0, 7).map((w) => w.fonte)).toEqual(fontesDaVisao);
    expect(r[7]).toMatchObject({ fonte: "vendas", largura: 1, altura: 1 });
    expect(r[8]).toMatchObject({ fonte: "receitaPorDia", largura: 4, altura: 2 });
  });

  it("não duplica cartão da visão que já está no painel", () => {
    const r = lerLayoutSalvo([{ id: "x", tipo: "especial", fonte: "ritmo", titulo: "Ritmo", largura: 1 }]);
    expect(r.filter((w) => w.fonte === "ritmo")).toHaveLength(1);
    expect(r).toHaveLength(7);
  });

  it("layout já no formato novo volta igual (a migração acontece uma vez só)", () => {
    const novo = [{ id: "a", tipo: "numero", fonte: "vendas", titulo: "Vendas", largura: 2, altura: 1 }];
    expect(lerLayoutSalvo(novo)).toEqual(novo);
  });

  it("painel vazio salvo continua vazio", () => {
    expect(lerLayoutSalvo([])).toEqual([]);
  });
});

describe("painelPadrao", () => {
  it("começa com os cartões da visão geral, todos com altura", () => {
    const p = painelPadrao();
    expect(p.slice(0, 7).map((w) => w.fonte)).toEqual(fontesDaVisao);
    expect(p.every((w) => typeof w.altura === "number")).toBe(true);
    expect(new Set(p.map((w) => w.id)).size).toBe(p.length);
  });
});

describe("encaixeDenso", () => {
  it("põe cada cartão no primeiro espaço livre, linha por linha", () => {
    expect(
      encaixeDenso(
        [
          { largura: 4, altura: 2 },
          { largura: 1, altura: 1 },
          { largura: 3, altura: 1 },
          { largura: 1, altura: 1 },
        ],
        4
      )
    ).toEqual([
      { coluna: 0, linha: 0 },
      { coluna: 0, linha: 2 },
      { coluna: 1, linha: 2 },
      { coluna: 0, linha: 3 },
    ]);
  });

  it("cartão pequeno sobe para preencher o buraco", () => {
    expect(
      encaixeDenso(
        [
          { largura: 3, altura: 1 },
          { largura: 2, altura: 1 },
          { largura: 1, altura: 1 },
        ],
        4
      )
    ).toEqual([
      { coluna: 0, linha: 0 },
      { coluna: 0, linha: 1 },
      { coluna: 3, linha: 0 },
    ]);
  });

  it("cartão mais largo que a grade ocupa a grade toda", () => {
    expect(encaixeDenso([{ largura: 4, altura: 1 }, { largura: 1, altura: 1 }], 2)).toEqual([
      { coluna: 0, linha: 0 },
      { coluna: 0, linha: 1 },
    ]);
  });
});
