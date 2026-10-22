import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  pipelineStage: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(async (): Promise<unknown[]> => []) },
  deal: { findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
  dealContact: { upsert: vi.fn(), deleteMany: vi.fn(), count: vi.fn(async () => 0) },
  dealStageEvent: { createMany: vi.fn() },
  pipelineStageRule: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
  $executeRaw: vi.fn(),
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

describe("PATCH /api/deals/[dealId] — regras da etapa", () => {
  const ETAPAS = [
    { id: "s1", name: "Novo", type: "open", position: 0, pipelineId: "p1", probability: 10 },
    { id: "s2", name: "Proposta", type: "open", position: 1, pipelineId: "p1", probability: 40 },
    { id: "sw", name: "Ganho", type: "won", position: 2, pipelineId: "p1", probability: 100 },
  ];
  beforeEach(() => {
    db.pipelineStage.findFirst.mockResolvedValue({ id: "s2", pipelineId: "p1" });
    db.pipelineStage.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ETAPAS.find((e) => e.id === where.id) ?? null);
    db.pipelineStage.findMany.mockResolvedValue(ETAPAS);
    db.deal.findUnique.mockResolvedValue({ ...DEAL, amountCents: 0, expectedClosingAt: null, ownerId: null, companyId: null });
    db.pipelineStageRule.findMany.mockResolvedValue([{ stageId: "s2", requiredFields: ["valor", "empresa"], canBeSkipped: true, rottingDays: 7, guidance: "" }]);
  });

  it("faltou campo: 422 com a lista exata e nada gravado", async () => {
    const res = await patch({ stageId: "s2" });
    expect(res.status).toBe(422);
    const corpo = await res.json();
    expect(corpo.codigo).toBe("campos_obrigatorios");
    expect(corpo.faltando.map((f: { campo: string }) => f.campo)).toEqual(["valor", "empresa"]);
    expect(db.deal.update).not.toHaveBeenCalled();
  });

  it("modal: os campos no mesmo PATCH contam — salva e move numa ação", async () => {
    const res = await patch({ stageId: "s2", amount: 1500, companyId: "co1" });
    expect(res.status).toBe(200);
    // 1º grava os campos, depois move.
    expect(db.deal.update.mock.calls[0][0].data).toMatchObject({ amountCents: 150_000 });
    expect(db.deal.update.mock.calls[1][0].data).toMatchObject({ stageId: "s2" });
  });

  it("desfazer o ganho (corpo de corpoParaDesfazer): reabre na etapa anterior pelo moveDealStage, origem usuario", async () => {
    db.deal.findFirst.mockResolvedValue({ ...DEAL, stageId: "sw" });
    db.deal.findUnique.mockResolvedValue({ ...DEAL, stageId: "sw", amountCents: 1, expectedClosingAt: null, ownerId: null, companyId: "c" });
    const res = await patch({ stageId: "s2", reabrir: true });
    expect(res.status).toBe(200);
    expect(db.deal.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stageId: "s2", closedAt: null, probability: 40 }) }));
    expect(db.dealStageEvent.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ fromStageId: "sw", toStageId: "s2", origem: "usuario" })],
    });
  });

  it("desfazer a mudança respeita as regras: etapa anterior com campo faltando → 422", async () => {
    const res = await patch({ stageId: "s2" });
    expect(res.status).toBe(422);
    expect(db.deal.update).not.toHaveBeenCalled();
  });

  it("desfazer o arquivar: archived false limpa archivedAt", async () => {
    const res = await patch({ archived: false });
    expect(res.status).toBe(200);
    expect(db.deal.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { archivedAt: null } });
  });

  it("negócio ganho: 409 sem reabrir", async () => {
    db.deal.findFirst.mockResolvedValue({ ...DEAL, stageId: "sw" });
    db.deal.findUnique.mockResolvedValue({ ...DEAL, stageId: "sw", amountCents: 1, expectedClosingAt: null, ownerId: null, companyId: "c" });
    const res = await patch({ stageId: "s2" });
    expect(res.status).toBe(409);
    expect((await res.json()).codigo).toBe("negocio_fechado");
  });
});

describe("GET /api/deals/[dealId]", () => {
  it("tarefas e notas filtradas pela org, tarefas em aberto primeiro", async () => {
    db.deal.findFirst.mockResolvedValue({ ...DEAL, pipeline: { stages: [{ id: "s1", type: "open" }] } });
    const res = await GET(new Request("http://x/api/deals/d1"), params);
    // Sem as tabelas novas: regra padrão (7 dias) e sem perda estruturada.
    const corpo = await res.json();
    expect(corpo.regras.s1).toMatchObject({ diasParado: 7, camposObrigatorios: [] });
    expect(corpo.deal.perda).toBeNull();
    const include = db.deal.findFirst.mock.calls[0][0].include;
    expect(include.tasks.where).toEqual({ orgId: "org" });
    expect(include.tasks.orderBy[0]).toEqual({ doneAt: { sort: "asc", nulls: "first" } });
    expect(include.notes.where).toEqual({ orgId: "org" });
  });
});
