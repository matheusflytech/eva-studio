import { describe, expect, it } from "vitest";
import { relevo, ruido, SEGMENTOS } from "./campo-de-curvas";

describe("fundo vivo", () => {
  it("o ruído fica entre 0 e 1 e é contínuo", () => {
    for (let i = 0; i < 200; i++) {
      const x = i * 0.37, y = i * 0.11, z = i * 0.05;
      const v = ruido(x, y, z);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      expect(Math.abs(ruido(x + 0.001, y, z) - v)).toBeLessThan(0.01);
    }
    expect(relevo(1.2, 3.4, 5.6)).toBeLessThanOrEqual(1);
  });

  it("marching squares: célula toda acima ou abaixo não desenha; as outras ligam bordas aos pares", () => {
    expect(SEGMENTOS[0]).toBeUndefined();
    expect(SEGMENTOS[15]).toBeUndefined();
    for (let caso = 1; caso <= 14; caso++) {
      const seg = SEGMENTOS[caso];
      expect(seg.length % 2).toBe(0);
      for (const borda of seg) expect([0, 1, 2, 3]).toContain(borda);
    }
    // casos complementares desenham a mesma linha
    expect([...SEGMENTOS[1]].sort()).toEqual([...SEGMENTOS[14]].sort());
    expect([...SEGMENTOS[4]].sort()).toEqual([...SEGMENTOS[11]].sort());
  });
});
