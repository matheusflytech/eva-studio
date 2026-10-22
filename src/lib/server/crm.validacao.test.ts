import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  const m = {
    pipeline: { findFirst: vi.fn(), create: vi.fn() },
    pipelineStage: { findUnique: vi.fn(), findMany: vi.fn() },
    deal: { findUnique: vi.fn(), update: vi.fn() },
    $executeRaw: vi.fn(),
    $transaction: vi.fn(),
  };
  return m;
});
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { ErroDeCrm, ensureDefaultPipeline, moveDealStage } from "./crm";

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
});

describe("ensureDefaultPipeline", () => {
  it("já existe: não trava nem cria", async () => {
    db.pipeline.findFirst.mockResolvedValue({ id: "p1", stages: [] });
    await expect(ensureDefaultPipeline("o1")).resolves.toMatchObject({ id: "p1" });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("criado por outra requisição enquanto esperava a trava: não duplica", async () => {
    db.pipeline.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "p-outro", stages: [] });
    await expect(ensureDefaultPipeline("o1")).resolves.toMatchObject({ id: "p-outro" });
    expect(db.$executeRaw).toHaveBeenCalledTimes(1);
    expect(db.pipeline.create).not.toHaveBeenCalled();
  });

  it("ninguém criou: cria dentro da transação", async () => {
    db.pipeline.findFirst.mockResolvedValue(null);
    db.pipeline.create.mockResolvedValue({ id: "p-novo", stages: [] });
    await expect(ensureDefaultPipeline("o1")).resolves.toMatchObject({ id: "p-novo" });
    expect(db.pipeline.create).toHaveBeenCalledTimes(1);
  });
});

describe("moveDealStage", () => {
  it("etapa de outra org: recusa sem gravar", async () => {
    db.deal.findUnique.mockResolvedValue({ stageId: "s1", orgId: "o1" });
    db.pipelineStage.findUnique.mockResolvedValue(null);
    await expect(moveDealStage("d1", "s-outra")).rejects.toBeInstanceOf(ErroDeCrm);
    expect(db.pipelineStage.findUnique).toHaveBeenCalledWith({ where: { id: "s-outra", pipeline: { orgId: "o1" } } });
    expect(db.deal.update).not.toHaveBeenCalled();
  });
});
