import { describe, it, expect } from "vitest";
import { diaDaPrevisao, fechamentoPassou, sinalDoNegocio, type NegocioKanban } from "./modelo";
import { parseReais, reaisDigitados } from "@/lib/dinheiro";

const base = (expectedClosingAt: string): NegocioKanban => ({
  id: "1",
  name: "N",
  amountCents: 0,
  probability: 10,
  company: null,
  owner: null,
  contacts: [],
  openTasks: 0,
  expectedClosingAt,
  closedAt: null,
  customFields: {},
  createdAt: "2026-10-01T12:00:00Z",
  stageSince: "2026-10-19T12:00:00Z",
  whatsapp: null,
  nextTask: null,
});

describe("previsão de fechamento é dia, não instante", () => {
  it("registro antigo à meia-noite UTC não cai na véspera", () => {
    expect(diaDaPrevisao("2026-10-20T00:00:00.000Z")).toBe("2026-10-20");
    expect(diaDaPrevisao("2026-10-20T12:00:00.000Z")).toBe("2026-10-20");
  });

  it("o próprio dia ainda não é atraso, mesmo à noite em SP", () => {
    const noiteEmSP = new Date("2026-10-21T01:00:00Z"); // 20/10 22h em SP
    expect(fechamentoPassou(base("2026-10-20T12:00:00Z"), noiteEmSP)).toBe(false);
    expect(fechamentoPassou(base("2026-10-19T12:00:00Z"), noiteEmSP)).toBe(true);
  });

  it("cartão mostra o dia escolhido", () => {
    const agora = new Date("2026-10-10T12:00:00Z");
    expect(sinalDoNegocio(base("2026-10-28T00:00:00Z"), "open", agora)?.texto).toBe("Fecha 28 out");
  });
});

describe("valor digitado", () => {
  it("ponto decimal não vira milhar", () => {
    expect(parseReais("1500.50")).toBe(1500.5);
    expect(parseReais("1.500,50")).toBe(1500.5);
    expect(parseReais("1.500")).toBe(1500);
  });

  it("inválido ou acima do teto é recusado, vazio é zero", () => {
    expect(reaisDigitados("abc")).toBeNull();
    expect(reaisDigitados("30.000.000")).toBeNull();
    expect(reaisDigitados("")).toBe(0);
  });
});
