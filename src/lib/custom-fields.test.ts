import { describe, it, expect } from "vitest";
import { chaveSugerida, formatarValor, normalizarValor, parseNumero, valorNumerico } from "./custom-fields";

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

const dataHora = { type: "datetime" as const, label: "Pedido", options: [] };
const hora = { type: "time" as const, label: "Abertura", options: [] };

describe("campo data e hora", () => {
  it("guarda AAAA-MM-DDTHH:mm, aceita espaço e segundos, recusa dia ou hora que não existe", () => {
    expect(normalizarValor(dataHora, "2026-10-28T11:16")).toEqual({ ok: true, valor: "2026-10-28T11:16" });
    expect(normalizarValor(dataHora, "2026-10-28 9:05:59")).toEqual({ ok: true, valor: "2026-10-28T09:05" });
    expect(normalizarValor(dataHora, "2026-02-31T10:00").ok).toBe(false);
    expect(normalizarValor(dataHora, "2026-10-28T24:00").ok).toBe(false);
    expect(normalizarValor(dataHora, "2026-10-28").ok).toBe(false);
    expect(formatarValor(dataHora, "2026-10-28T11:16")).toBe("28/10/2026 11:16");
  });
});

describe("campo hora", () => {
  it("guarda HH:mm", () => {
    expect(normalizarValor(hora, "9:05")).toEqual({ ok: true, valor: "09:05" });
    expect(normalizarValor(hora, "14:30:00")).toEqual({ ok: true, valor: "14:30" });
    expect(normalizarValor(hora, "25:00").ok).toBe(false);
    expect(normalizarValor(hora, "14h30").ok).toBe(false);
  });
});

describe("nome interno do campo", () => {
  it("prévia igual à regra do servidor: slug, reservado e sufixo", () => {
    expect(chaveSugerida("Data do pedido", new Set())).toBe("data_do_pedido");
    expect(chaveSugerida("Data do pedido", new Set(["data_do_pedido"]))).toBe("data_do_pedido_2");
    expect(chaveSugerida("E-mail", new Set())).toBe("e_mail");
    expect(chaveSugerida("Telefone", new Set())).toBe("telefone_campo");
  });
});
