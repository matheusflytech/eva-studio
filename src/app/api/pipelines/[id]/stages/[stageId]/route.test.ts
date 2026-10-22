import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  const m = {
    pipelineStage: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
    deal: { count: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    dealStageEvent: { createMany: vi.fn() },
    $transaction: vi.fn(),
  };
  m.$transaction.mockImplementation(async (fn: (tx: typeof m) => unknown) => fn(m));
  return m;
});
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => ({
  requirePermission: vi.fn(async () => ({ orgId: "org", userId: "u", role: "owner" })),
}));

import { DELETE, PATCH } from "./route";

const params = { params: Promise.resolve({ id: "p1", stageId: "s-ganho" }) };
const ETAPAS = [
  { id: "s-aberta", pipelineId: "p1", name: "Novo", type: "open", probability: 10, position: 0 },
  { id: "s-ganho", pipelineId: "p1", name: "Ganho", type: "won", probability: 100, position: 1 },
  { id: "s-ganho2", pipelineId: "p1", name: "Fechado", type: "won", probability: 100, position: 2 },
];

beforeEach(() => {
  vi.clearAllMocks();
  db.$transaction.mockImplementation(async (fn: (tx: typeof db) => unknown) => fn(db));
  db.pipelineStage.findFirst.mockResolvedValue(ETAPAS[1]);
  db.pipelineStage.findMany.mockResolvedValue(ETAPAS);
  db.deal.count.mockResolvedValue(2);
  db.deal.findMany.mockResolvedValue([{ id: "d1" }, { id: "d2" }]);
});

describe("DELETE etapa com moverPara", () => {
  it("fechada → fechada preserva closedAt e registra eventos", async () => {
    const res = await DELETE(new Request("http://x?moverPara=s-ganho2", { method: "DELETE" }), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, movidos: 2 });

    // Só quem não tinha data de fechamento ganha uma; o update geral não toca em closedAt.
    const chamadas = db.deal.updateMany.mock.calls.map((c) => c[0]);
    expect(chamadas[0]).toMatchObject({ where: { stageId: "s-ganho", closedAt: null } });
    expect(chamadas[1].data).not.toHaveProperty("closedAt");
    expect(chamadas[1].data).toMatchObject({ stageId: "s-ganho2", probability: 100, lostReason: "" });

    expect(db.dealStageEvent.createMany).toHaveBeenCalledWith({
      data: [
        { orgId: "org", dealId: "d1", pipelineId: "p1", fromStageId: "s-ganho", toStageId: "s-ganho2", origem: "usuario" },
        { orgId: "org", dealId: "d2", pipelineId: "p1", fromStageId: "s-ganho", toStageId: "s-ganho2", origem: "usuario" },
      ],
    });
    expect(db.pipelineStage.delete).toHaveBeenCalledWith({ where: { id: "s-ganho" } });
  });

  it("fechada → aberta limpa closedAt e motivo da perda", async () => {
    await DELETE(new Request("http://x?moverPara=s-aberta", { method: "DELETE" }), params);
    const chamadas = db.deal.updateMany.mock.calls.map((c) => c[0]);
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].data).toMatchObject({ stageId: "s-aberta", closedAt: null, lostReason: "" });
  });

  it("sem destino e com negócios → 409, nada apagado", async () => {
    const res = await DELETE(new Request("http://x", { method: "DELETE" }), params);
    expect(res.status).toBe(409);
    expect(db.pipelineStage.delete).not.toHaveBeenCalled();
    expect(db.deal.updateMany).not.toHaveBeenCalled();
  });
});

describe("PATCH etapa", () => {
  it("ganho virando aberta sem probabilidade não fica com 100", async () => {
    await PATCH(new Request("http://x", { method: "PATCH", body: JSON.stringify({ type: "open" }) }), params);
    const update = db.pipelineStage.update.mock.calls[0][0];
    expect(update.data).toMatchObject({ type: "open", probability: 50 });
  });
});
