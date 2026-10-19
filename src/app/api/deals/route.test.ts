import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  pipeline: { findFirst: vi.fn() },
  pipelineStage: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
  deal: { create: vi.fn(), aggregate: vi.fn() },
  dealStageEvent: { create: vi.fn() },
  contact: { findFirst: vi.fn() },
  company: { findFirst: vi.fn() },
  profile: { findFirst: vi.fn() },
  customField: { findMany: vi.fn(async () => []) },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => ({
  requirePermission: vi.fn(async () => ({ orgId: "org", userId: "u", role: "owner" })),
}));

import { POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/deals", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  db.pipelineStage.findUnique.mockResolvedValue({ id: "s1", pipelineId: "p1", probability: 10, type: "open" });
  db.profile.findFirst.mockResolvedValue({ id: "u" });
  db.contact.findFirst.mockResolvedValue({ id: "c1" });
  db.deal.aggregate.mockResolvedValue({ _min: { position: 0 } });
  db.deal.create.mockResolvedValue({ id: "d1", name: "X", orgId: "org", pipelineId: "p1", stageId: "s1" });
});

describe("POST /api/deals", () => {
  it("JSON inválido → 400", async () => {
    const res = await post("{nao é json");
    expect(res.status).toBe(400);
    expect(db.deal.create).not.toHaveBeenCalled();
  });

  it("etapa de outra org → 404, sem criar", async () => {
    db.pipelineStage.findUnique.mockResolvedValue(null);
    const res = await post({ name: "X", stageId: "s-outra" });
    expect(res.status).toBe(404);
    expect(db.pipelineStage.findUnique).toHaveBeenCalledWith({ where: { id: "s-outra", pipeline: { orgId: "org" } } });
    expect(db.deal.create).not.toHaveBeenCalled();
  });

  it("etapa de outro funil da org → 400", async () => {
    const res = await post({ name: "X", pipelineId: "p2", stageId: "s1" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Etapa de outro funil.");
  });

  it("contato de outra org → 404", async () => {
    db.contact.findFirst.mockResolvedValue(null);
    const res = await post({ name: "X", stageId: "s1", contactId: "c-outra" });
    expect(res.status).toBe(404);
    expect(db.deal.create).not.toHaveBeenCalled();
  });

  it('amount "abc" → 400', async () => {
    const res = await post({ name: "X", amount: "abc" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Valor inválido/);
  });

  it("amount acima do Int32 → 400", async () => {
    const res = await post({ name: "X", amount: 30_000_000 });
    expect(res.status).toBe(400);
  });

  it("expectedClosingAt inválido → 400", async () => {
    const res = await post({ name: "X", expectedClosingAt: "2026-02-31" });
    expect(res.status).toBe(400);
  });

  it("data só com dia vira meio-dia UTC e valor em reais vira centavos", async () => {
    const res = await post({ name: "X", stageId: "s1", amount: "1.500,50", expectedClosingAt: "2026-10-20" });
    expect(res.status).toBe(200);
    const data = db.deal.create.mock.calls[0][0].data;
    expect(data.amountCents).toBe(150050);
    expect(data.expectedClosingAt.toISOString()).toBe("2026-10-20T12:00:00.000Z");
  });

  it("campos personalizados validados contra o funil da etapa, não o do corpo", async () => {
    db.pipelineStage.findUnique.mockResolvedValue({ id: "s9", pipelineId: "p9", probability: 10, type: "open" });
    await post({ name: "X", stageId: "s9", customFields: {} });
    const chamada = db.customField.findMany.mock.calls[0] as unknown as [{ where: { OR: unknown[] } }];
    const where = chamada[0].where;
    expect(where.OR).toContainEqual({ pipelineId: "p9" });
  });
});
