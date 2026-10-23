import { describe, expect, it } from "vitest";
import { PALETA_DA_ORBE, chaveDaCor, corPadraoDoAgente, hexParaRgb, normalizarHex } from "./cor-do-agente";

describe("cor da orbe do agente", () => {
  it("cor padrão é estável e válida para o mesmo id", () => {
    const a = corPadraoDoAgente("agente-123");
    expect(corPadraoDoAgente("agente-123")).toBe(a);
    expect(normalizarHex(a)).toBe(a);
  });

  it("normaliza hex de 3 e 6 dígitos, com ou sem #", () => {
    expect(normalizarHex("#1F6FD6")).toBe("#1f6fd6");
    expect(normalizarHex("1f6fd6")).toBe("#1f6fd6");
    expect(normalizarHex(" #abc ")).toBe("#aabbcc");
    expect(normalizarHex("#12345")).toBeNull();
    expect(normalizarHex("azul")).toBeNull();
  });

  it("converte hex em rgb", () => {
    expect(hexParaRgb("#1f6fd6")).toEqual([31, 111, 214]);
    expect(hexParaRgb("#fff")).toEqual([255, 255, 255]);
  });

  it("paleta tem 8 a 10 cores válidas e sem repetição", () => {
    expect(PALETA_DA_ORBE.length).toBeGreaterThanOrEqual(8);
    expect(PALETA_DA_ORBE.length).toBeLessThanOrEqual(10);
    const hexes = PALETA_DA_ORBE.map((c) => c.hex);
    expect(new Set(hexes).size).toBe(hexes.length);
    for (const h of hexes) expect(normalizarHex(h)).toBe(h);
  });

  it("chave do navegador por agente", () => {
    expect(chaveDaCor("abc")).toBe("eva.agente.cor.abc");
  });
});
