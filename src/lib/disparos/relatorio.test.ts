import { describe, expect, it } from "vitest";
import { diasDoPeriodo, periodo, seriePorDia, somar, taxa, variacao } from "./relatorio";

describe("periodo", () => {
  it("7 dias terminando hoje (Brasília) e o anterior do mesmo tamanho", () => {
    const p = periodo(7, new Date("2026-11-13T15:00:00Z"));
    expect(p.de.toISOString()).toBe("2026-11-07T03:00:00.000Z");
    expect(p.ate.toISOString()).toBe("2026-11-14T03:00:00.000Z");
    expect(p.antesDe.toISOString()).toBe("2026-10-31T03:00:00.000Z");
    expect(p.antesAte.toISOString()).toBe(p.de.toISOString());
  });
  it("limita entre 1 e 90 dias", () => {
    expect(periodo(0).dias).toBe(7);
    expect(periodo(500).dias).toBe(90);
  });
});

describe("série por dia", () => {
  it("preenche os dias sem dado com zero", () => {
    const p = periodo(3, new Date("2026-11-13T15:00:00Z"));
    const dias = diasDoPeriodo(p.de, p.dias);
    expect(dias).toEqual(["2026-11-11", "2026-11-12", "2026-11-13"]);
    const s = seriePorDia([{ metrica: "enviados", dia: "2026-11-12", total: BigInt(5) }, { metrica: "falhas", dia: "2026-11-13", total: 2 }], dias);
    expect(s[0].enviados).toBe(0);
    expect(s[1].enviados).toBe(5);
    expect(s[2].falhas).toBe(2);
    expect(somar(s)).toMatchObject({ enviados: 5, falhas: 2, entregues: 0 });
  });
});

describe("variação e taxa", () => {
  it("sem base anterior não inventa porcentagem", () => {
    expect(variacao(10, 0)).toBeNull();
    expect(variacao(15, 10)).toBeCloseTo(0.5);
    expect(taxa(1, 0)).toBe(0);
  });
});
