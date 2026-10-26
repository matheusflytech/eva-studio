import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { calcularRitmo, montarCalor, preencherMeses } from "./dashboard-overview";

describe("calcularRitmo", () => {
  it("pontos = parte da média mensal já alcançada; no ritmo quando passa do esperado até hoje", () => {
    expect(calcularRitmo(5000, [10000, 10000, 10000], 15, 30)).toEqual({ pontos: 50, noRitmo: true, mediaMensal: 10000, esperadoAteHoje: 5000 });
    expect(calcularRitmo(4000, [10000, 0, 8000], 15, 30)).toMatchObject({ pontos: 44, noRitmo: false, mediaMensal: 9000 });
    expect(calcularRitmo(30000, [10000, 10000, 10000], 30, 30).pontos).toBe(100);
  });

  it("sem histórico: 100 se vendeu, 0 se não", () => {
    expect(calcularRitmo(100, [0, 0, 0], 1, 30)).toMatchObject({ pontos: 100, mediaMensal: 0 });
    expect(calcularRitmo(0, [0, 0, 0], 1, 30)).toMatchObject({ pontos: 0, noRitmo: false });
  });
});

describe("preencherMeses", () => {
  it("põe zero nos meses sem venda, virando o ano", () => {
    const r = preencherMeses([{ mes: "2026-01", receita: 5, vendas: 1, criados: 2 }], "2025-11", "2026-02");
    expect(r.map((m) => [m.mes, m.receita])).toEqual([["2025-11", 0], ["2025-12", 0], ["2026-01", 5], ["2026-02", 0]]);
  });
});

describe("montarCalor", () => {
  it("soma em blocos de 2 horas por dia da semana", () => {
    const g = montarCalor([{ dow: 1, hora: 9, total: 3 }, { dow: 1, hora: 8, total: 2 }, { dow: 0, hora: 23, total: 1 }]);
    expect(g[1][4]).toBe(5);
    expect(g[0][11]).toBe(1);
    expect(g.flat().reduce((s, v) => s + v, 0)).toBe(6);
  });
});
