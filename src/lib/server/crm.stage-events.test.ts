import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  pipelineStage: { findUnique: vi.fn(), findMany: vi.fn() },
  pipeline: { findFirst: vi.fn() },
  deal: { update: vi.fn(), findUnique: vi.fn(), create: vi.fn(), aggregate: vi.fn() },
  dealStageEvent: { create: vi.fn() },
  customField: { findMany: vi.fn(async () => []) },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { createDeal, moveDealStage } from "./crm";

beforeEach(() => {
  vi.clearAllMocks();
  db.pipelineStage.findUnique.mockResolvedValue({ id: "s2", pipelineId: "p1", probability: 40, type: "open" });
  db.deal.aggregate.mockResolvedValue({ _min: { position: 0 } });
});

describe("moveDealStage grava o histórico", () => {
  it("registra de onde veio, para onde foi e quem moveu", async () => {
    db.deal.findUnique.mockResolvedValue({ id: "d1", orgId: "o1", stageId: "s1" });
    db.deal.update.mockResolvedValue({ id: "d1", orgId: "o1", pipelineId: "p1", stageId: "s2" });
    await moveDealStage("d1", "s2", undefined, "fluxo");
    expect(db.dealStageEvent.create).toHaveBeenCalledWith({
      data: { orgId: "o1", dealId: "d1", pipelineId: "p1", fromStageId: "s1", toStageId: "s2", origem: "fluxo" },
    });
  });

  it("mesma etapa: não grava evento (não é movimento)", async () => {
    db.deal.findUnique.mockResolvedValue({ id: "d1", orgId: "o1", stageId: "s2" });
    db.deal.update.mockResolvedValue({ id: "d1", orgId: "o1", pipelineId: "p1", stageId: "s2" });
    await moveDealStage("d1", "s2");
    expect(db.dealStageEvent.create).not.toHaveBeenCalled();
  });

  it("origem padrão é usuario", async () => {
    db.deal.findUnique.mockResolvedValue({ id: "d1", orgId: "o1", stageId: "s1" });
    db.deal.update.mockResolvedValue({ id: "d1", orgId: "o1", pipelineId: "p1", stageId: "s2" });
    await moveDealStage("d1", "s2");
    expect(db.dealStageEvent.create.mock.calls[0][0].data.origem).toBe("usuario");
  });

  it("falha ao gravar o histórico não desfaz o movimento", async () => {
    db.deal.findUnique.mockResolvedValue({ id: "d1", orgId: "o1", stageId: "s1" });
    db.deal.update.mockResolvedValue({ id: "d1", orgId: "o1", pipelineId: "p1", stageId: "s2" });
    db.dealStageEvent.create.mockRejectedValue(new Error("tabela não existe"));
    await expect(moveDealStage("d1", "s2")).resolves.toMatchObject({ stageId: "s2" });
  });
});

describe("createDeal grava a entrada na primeira etapa", () => {
  it("evento sem etapa de origem, com a origem informada", async () => {
    db.deal.create.mockResolvedValue({ id: "d9", orgId: "o1", pipelineId: "p1", stageId: "s2" });
    await createDeal({ orgId: "o1", name: "Teste", pipelineId: "p1", stageId: "s2", origem: "api" });
    expect(db.dealStageEvent.create).toHaveBeenCalledWith({
      data: { orgId: "o1", dealId: "d9", pipelineId: "p1", fromStageId: null, toStageId: "s2", origem: "api" },
    });
  });
});
