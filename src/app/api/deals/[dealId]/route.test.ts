import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  pipelineStage: { findUnique: vi.fn(), findFirst: vi.fn() },
  deal: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  dealContact: { upsert: vi.fn(), deleteMany: vi.fn() },
  dealStageEvent: { create: vi.fn() },
  contact: { findFirst: vi.fn() },
  company: { findFirst: vi.fn() },
  profile: { findFirst: vi.fn() },
  customField: { findMany: vi.fn(async () => []) },
  dealItem: { count: vi.fn(async () => 0) },
  dealAmountSetting: { findUnique: vi.fn(async (): Promise<{ manualAmount: boolean } | null> => null) },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => ({
  requirePermission: vi.fn(async () => ({ orgId: "org", userId: "u", role: "owner" })),
}));

import { GET, PATCH } from "./route";

const params = { params: Promise.resolve({ dealId: "d1" }) };
const patch = (body: unknown) =>
  PATCH(
    new Request("http://x/api/deals/d1", { method: "PATCH", body: typeof body === "string" ? body : JSON.stringify(body) }),
    params
  );

const DEAL = { id: "d1", orgId: "org", pipelineId: "p1", stageId: "s1", customFields: {} };

beforeEach(() => {
  vi.clearAllMocks();
  db.deal.findFirst.mockResolvedValue(DEAL);
  db.deal.findUnique.mockResolvedValue({ stageId: "s1", orgId: "org" });
  db.deal.update.mockResolvedValue({ ...DEAL });
  db.contact.findFirst.mockResolvedValue({ id: "c1" });
  db.company.findFirst.mockResolvedValue({ id: "co1" });
  db.profile.findFirst.mockResolvedValue({ id: "u" });
});

describe("PATCH /api/deals/[dealId]", () => {
  it("JSON inválido → 400", async () => {
    const res = await patch("nao-json");
    expect(res.status).toBe(400);
    expect(db.deal.update).not.toHaveBeenCalled();
  });

  it("addContactId de outra org → 404, sem vincular", async () => {
    db.contact.findFirst.mockResolvedValue(null);
    const res = await patch({ addContactId: "c-outra" });
    expect(res.status).toBe(404);
    expect(db.contact.findFirst).toHaveBeenCalledWith({ where: { id: "c-outra", orgId: "org" }, select: { id: true } });
    expect(db.dealContact.upsert).not.toHaveBeenCalled();
  });

  it("companyId de outra org → 404", async () => {
    db.company.findFirst.mockResolvedValue(null);
    const res = await patch({ companyId: "co-outra" });
    expect(res.status).toBe(404);
    expect(db.deal.update).not.toHaveBeenCalled();
  });

  it('amount "abc" → 400', async () => {
    const res = await patch({ amount: "abc" });
    expect(res.status).toBe(400);
  });

  it("expectedClosingAt inválido → 400", async () => {
    const res = await patch({ expectedClosingAt: "amanhã" });
    expect(res.status).toBe(400);
  });

  it("probabilidade não numérica → 400", async () => {
    const res = await patch({ probability: "muita" });
    expect(res.status).toBe(400);
  });

  it("campo inválido não deixa o negócio movido de etapa", async () => {
    db.pipelineStage.findFirst.mockResolvedValue({ id: "s2", pipelineId: "p1" });
    const res = await patch({ stageId: "s2", amount: "abc" });
    expect(res.status).toBe(400);
    expect(db.deal.update).not.toHaveBeenCalled();
  });

  it("etapa de outro funil → 400", async () => {
    db.pipelineStage.findFirst.mockResolvedValue({ id: "s9", pipelineId: "p9" });
    const res = await patch({ stageId: "s9" });
    expect(res.status).toBe(400);
    expect(db.deal.update).not.toHaveBeenCalled();
  });

  it("valor digitado num negócio cujo valor vem dos produtos → 409, sem gravar", async () => {
    db.dealItem.count.mockResolvedValueOnce(2);
    const res = await patch({ amount: 500 });
    expect(res.status).toBe(409);
    expect(db.deal.update).not.toHaveBeenCalled();
  });

  it("com valor manual ligado, o valor digitado passa", async () => {
    db.dealItem.count.mockResolvedValueOnce(2);
    db.dealAmountSetting.findUnique.mockResolvedValueOnce({ manualAmount: true });
    const res = await patch({ amount: 500 });
    expect(res.status).toBe(200);
    expect(db.deal.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { amountCents: 50_000 } });
  });

  it("motivo da perda gravado quando a etapa enviada é a atual", async () => {
    const res = await patch({ stageId: "s1", lostReason: "Preço" });
    expect(res.status).toBe(200);
    expect(db.deal.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { lostReason: "Preço" } });
  });
});

describe("GET /api/deals/[dealId]", () => {
  it("tarefas e notas filtradas pela org, tarefas em aberto primeiro", async () => {
    await GET(new Request("http://x/api/deals/d1"), params);
    const include = db.deal.findFirst.mock.calls[0][0].include;
    expect(include.tasks.where).toEqual({ orgId: "org" });
    expect(include.tasks.orderBy[0]).toEqual({ doneAt: { sort: "asc", nulls: "first" } });
    expect(include.notes.where).toEqual({ orgId: "org" });
  });
});
