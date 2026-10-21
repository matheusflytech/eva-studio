import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  aiUsage: { createMany: vi.fn(), groupBy: vi.fn() },
  aiKeyLimit: { findMany: vi.fn(), upsert: vi.fn() },
  credential: { findFirst: vi.fn(), findMany: vi.fn() },
  agent: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { chavesNoLimite, custoEstimado, inicioDoMesSP, registrarUso, salvarLimite, situacaoDoLimite } from "./uso";

beforeEach(() => vi.clearAllMocks());

describe("contas do mês", () => {
  it("o mês começa à meia-noite de Brasília (03:00 UTC)", () => {
    expect(inicioDoMesSP(new Date("2026-10-21T12:00:00Z")).toISOString()).toBe("2026-10-01T03:00:00.000Z");
    // 1º de novembro às 01:00 em Brasília ainda é 31/10 às 04:00 UTC: já é novembro.
    expect(inicioDoMesSP(new Date("2026-11-01T04:00:00Z")).toISOString()).toBe("2026-11-01T03:00:00.000Z");
  });

  it("situação do limite: alerta a partir de 80%", () => {
    expect(situacaoDoLimite(100, null).nivel).toBe("sem_limite");
    expect(situacaoDoLimite(79, 100).nivel).toBe("ok");
    expect(situacaoDoLimite(80, 100).nivel).toBe("alerta");
    expect(situacaoDoLimite(100, 100).nivel).toBe("estourado");
  });

  it("custo estimado só com preço informado", () => {
    expect(custoEstimado(2_500_000, 4)).toBe(10);
    expect(custoEstimado(123, null)).toBeNull();
  });
});

describe("registrarUso", () => {
  it("nunca lança, mesmo sem a tabela", async () => {
    db.aiUsage.createMany.mockRejectedValue(new Error("relation does not exist"));
    await expect(
      registrarUso([{ orgId: "o", provider: "openai", model: "m", inputTokens: 1, outputTokens: 1, ok: true }])
    ).resolves.toBeUndefined();
  });
});

describe("chavesNoLimite", () => {
  it("devolve só as chaves que gastaram o limite no mês", async () => {
    db.aiKeyLimit.findMany.mockResolvedValue([
      { credentialId: "a", limiteMensalTokens: 1000 },
      { credentialId: "b", limiteMensalTokens: 1000 },
    ]);
    db.aiUsage.groupBy.mockResolvedValue([
      { credentialId: "a", _sum: { inputTokens: 900, outputTokens: 150 } },
      { credentialId: "b", _sum: { inputTokens: 100, outputTokens: 10 } },
    ]);
    expect([...(await chavesNoLimite("o", ["a", "b", ""]))]).toEqual(["a"]);
    expect(db.aiKeyLimit.findMany.mock.calls[0][0].where.orgId).toBe("o");
  });

  it("sem tabela: nenhuma chave bloqueada", async () => {
    db.aiKeyLimit.findMany.mockRejectedValue(new Error("no table"));
    expect((await chavesNoLimite("o", ["a"])).size).toBe(0);
  });
});

describe("salvarLimite", () => {
  it("só credencial do próprio contrato", async () => {
    db.credential.findFirst.mockResolvedValue(null);
    expect(await salvarLimite("o", "alheia", 1000, null)).toMatchObject({ ok: false, status: 404 });
    expect(db.credential.findFirst.mock.calls[0][0].where).toEqual({ id: "alheia", orgId: "o" });
  });

  it("valida números e aceita limpar", async () => {
    db.credential.findFirst.mockResolvedValue({ id: "c" });
    expect(await salvarLimite("o", "c", -5, null)).toMatchObject({ ok: false, status: 400 });
    expect(await salvarLimite("o", "c", "", "")).toEqual({ ok: true });
    expect(db.aiKeyLimit.upsert.mock.calls[0][0].update).toEqual({ limiteMensalTokens: null, precoMilhaoBrl: null });
  });
});
