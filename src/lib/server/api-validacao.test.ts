import { describe, expect, it, vi } from "vitest";

const { prismaMock } = vi.hoisted(() => ({
  prismaMock: {
    contact: { findFirst: vi.fn() },
    company: { findFirst: vi.fn() },
    profile: { findFirst: vi.fn() },
    deal: { findFirst: vi.fn() },
    agent: { findFirst: vi.fn() },
    pipelineStage: { findFirst: vi.fn() },
    pipeline: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: prismaMock }));

import { conferirReferencias, dataOpcional, inteiroEntre, lerCorpo, parseReais, reaisParaCentavos } from "./api-validacao";

describe("lerCorpo", () => {
  it("devolve null para JSON inválido ou não-objeto", async () => {
    expect(await lerCorpo(new Request("http://x", { method: "POST", body: "{" }))).toBeNull();
    expect(await lerCorpo(new Request("http://x", { method: "POST", body: "[1]" }))).toBeNull();
    expect(await lerCorpo(new Request("http://x", { method: "POST", body: '{"a":1}' }))).toEqual({ a: 1 });
  });
});

describe("parseReais / reaisParaCentavos", () => {
  it("entende os formatos brasileiros e o ponto decimal", () => {
    expect(parseReais("R$ 1.500,50")).toBe(1500.5);
    expect(parseReais("1500.50")).toBe(1500.5);
    expect(parseReais("1.500")).toBe(1500);
    expect(parseReais("1.500.000")).toBe(1500000);
    expect(parseReais("abc")).toBeNaN();
  });
  it("converte para centavos e recusa inválido ou acima do teto", () => {
    expect(reaisParaCentavos(1500.5)).toBe(150050);
    expect(reaisParaCentavos("1.500,50")).toBe(150050);
    expect(reaisParaCentavos(undefined)).toBeUndefined();
    expect(reaisParaCentavos("")).toBe(0);
    expect(reaisParaCentavos("abc")).toBeNull();
    expect(reaisParaCentavos(-1)).toBeNull();
    expect(reaisParaCentavos(30_000_000)).toBeNull();
  });
});

describe("dataOpcional", () => {
  it("data pura vira meio-dia UTC (mesmo dia em São Paulo)", () => {
    expect((dataOpcional("2026-11-01") as Date).toISOString()).toBe("2026-11-01T12:00:00.000Z");
  });
  it("recusa data inexistente e lixo; null limpa", () => {
    expect(dataOpcional("2026-02-31")).toBe("invalida");
    expect(dataOpcional("31/12/2026")).toBe("invalida");
    expect(dataOpcional(null)).toBeNull();
    expect(dataOpcional(undefined)).toBeUndefined();
    expect((dataOpcional("2026-10-20T17:00:00.000Z") as Date).toISOString()).toBe("2026-10-20T17:00:00.000Z");
  });
});

describe("inteiroEntre", () => {
  it("arredonda e limita", () => {
    expect(inteiroEntre(33.5, 0, 100)).toBe(34);
    expect(inteiroEntre(150, 0, 100)).toBe(100);
    expect(inteiroEntre("abc", 0, 100)).toBeNull();
  });
});

describe("conferirReferencias", () => {
  it("aceita ids da org e ignora vazios", async () => {
    prismaMock.contact.findFirst.mockResolvedValue({ id: "c1" });
    expect(await conferirReferencias("org", { contactId: "c1", companyId: null, ownerId: "" })).toBeNull();
    expect(prismaMock.contact.findFirst).toHaveBeenCalledWith({ where: { id: "c1", orgId: "org" }, select: { id: true } });
  });
  it("recusa id de outra org", async () => {
    prismaMock.company.findFirst.mockResolvedValue(null);
    expect(await conferirReferencias("org", { companyId: "de-outra" })).toMatch(/Empresa não encontrad/);
  });
  it("etapa é conferida pelo funil da org", async () => {
    prismaMock.pipelineStage.findFirst.mockResolvedValue(null);
    expect(await conferirReferencias("org", { stageId: "s" })).toMatch(/Etapa/);
    expect(prismaMock.pipelineStage.findFirst).toHaveBeenCalledWith({ where: { id: "s", pipeline: { orgId: "org" } }, select: { id: true } });
  });
  it("recusa id que não é texto", async () => {
    expect(await conferirReferencias("org", { dealId: 5 })).toMatch(/inválido/);
  });
});
