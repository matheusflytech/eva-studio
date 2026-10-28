import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

import { calcularRitmo, montarCalor, preencherMeses } from "./dashboard-overview";

describe("calcularRitmo", () => {
  it("pontos = receita projetada até o fim do período sobre a média dos 3 anteriores", () => {
    expect(calcularRitmo(5000, [10000, 10000, 10000], 15, 30)).toEqual({
      pontos: 100, noRitmo: true, referencia: 10000, esperadoAteHoje: 5000, projetada: 10000,
    });
    // Período sem receita não entra na média.
    expect(calcularRitmo(4000, [10000, 0, 8000], 15, 30)).toMatchObject({ pontos: 89, noRitmo: false, referencia: 9000, projetada: 8000 });
    expect(calcularRitmo(30000, [10000, 10000, 10000], 30, 30).pontos).toBe(100);
  });

  it("período que termina hoje: projeção é a própria receita", () => {
    expect(calcularRitmo(6000, [12000, 12000, 12000], 30, 30)).toMatchObject({ projetada: 6000, pontos: 50, noRitmo: false });
  });

  it("sem histórico: 100 se vendeu, 0 se não", () => {
    expect(calcularRitmo(100, [0, 0, 0], 1, 30)).toMatchObject({ pontos: 100, referencia: 0 });
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
