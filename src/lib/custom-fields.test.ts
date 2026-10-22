import { describe, it, expect } from "vitest";
import { normalizarValor, parseNumero, valorNumerico } from "./custom-fields";

const numero = { type: "number" as const, label: "Consumo", options: [] };
const data = { type: "date" as const, label: "Visita", options: [] };

describe("campo número", () => {
  it('"1.5" é um e meio, não quinze', () => {
    expect(normalizarValor(numero, "1.5")).toEqual({ ok: true, valor: 1.5 });
    expect(normalizarValor(numero, "1,5")).toEqual({ ok: true, valor: 1.5 });
    expect(normalizarValor(numero, "1.500,25")).toEqual({ ok: true, valor: 1500.25 });
    expect(normalizarValor(numero, "480")).toEqual({ ok: true, valor: 480 });
    expect(normalizarValor(numero, "1.500")).toEqual({ ok: true, valor: 1500 });
    expect(normalizarValor(numero, "2.75")).toEqual({ ok: true, valor: 2.75 });
    expect(normalizarValor(numero, "abc").ok).toBe(false);
    expect(parseNumero("1.5")).toBe(1.5);
    expect(valorNumerico(numero, "1.5")).toBe(1.5);
  });
});

describe("campo data", () => {
  it("recusa dia que não existe", () => {
    expect(normalizarValor(data, "2026-02-31").ok).toBe(false);
    expect(normalizarValor(data, "2026-02-28")).toEqual({ ok: true, valor: "2026-02-28" });
    expect(normalizarValor(data, "2028-02-29").ok).toBe(true);
  });
});
