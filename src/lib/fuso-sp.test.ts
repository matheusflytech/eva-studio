import { describe, it, expect } from "vitest";
import { deSaoPaulo, paraCampoSaoPaulo, formatarSaoPaulo, amanhaAs, daquiA } from "./fuso-sp";

describe("deSaoPaulo", () => {
  it("lê o campo como horário de São Paulo (UTC-3)", () => {
    expect(deSaoPaulo("2026-10-20T09:00")?.toISOString()).toBe("2026-10-20T12:00:00.000Z");
  });

  it("aceita segundos", () => {
    expect(deSaoPaulo("2026-10-20T09:00:30")?.toISOString()).toBe("2026-10-20T12:00:30.000Z");
  });

  it("virada do dia: 22h em SP é 01h do dia seguinte em UTC", () => {
    expect(deSaoPaulo("2026-12-31T22:00")?.toISOString()).toBe("2027-01-01T01:00:00.000Z");
  });

  it("entrada inválida devolve null", () => {
    expect(deSaoPaulo("")).toBeNull();
    expect(deSaoPaulo("amanhã")).toBeNull();
    expect(deSaoPaulo("2026-13-40T99:00")).toBeNull();
  });
});

describe("paraCampoSaoPaulo", () => {
  it("é o inverso de deSaoPaulo", () => {
    expect(paraCampoSaoPaulo(new Date("2026-10-20T12:00:00.000Z"))).toBe("2026-10-20T09:00");
    expect(paraCampoSaoPaulo(deSaoPaulo("2026-03-05T07:45")!)).toBe("2026-03-05T07:45");
  });
});

describe("formatarSaoPaulo", () => {
  it("escreve data e hora de São Paulo", () => {
    expect(formatarSaoPaulo(new Date("2026-10-20T12:00:00.000Z"))).toBe("20/10/2026 às 09:00");
  });

  it("aceita string ISO", () => {
    expect(formatarSaoPaulo("2026-10-21T02:30:00.000Z")).toBe("20/10/2026 às 23:30");
  });
});

describe("atalhos", () => {
  it("amanhã 9h conta o dia de São Paulo, não o de UTC", () => {
    // 23h30 de 20/10 em SP = 02h30 de 21/10 em UTC. "Amanhã" é 21/10 em SP.
    const agora = new Date("2026-10-21T02:30:00.000Z");
    expect(amanhaAs(9, agora).toISOString()).toBe("2026-10-21T12:00:00.000Z");
  });

  it("daquiA soma minutos e zera os segundos", () => {
    const agora = new Date("2026-10-20T12:00:42.000Z");
    expect(daquiA(60, agora).toISOString()).toBe("2026-10-20T13:00:00.000Z");
  });
});
