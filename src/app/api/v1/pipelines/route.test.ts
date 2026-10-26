import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => {
  const tx = {
    deal: { count: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
    pipelineStage: { findMany: vi.fn(), delete: vi.fn(), update: vi.fn() },
    pipeline: { delete: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
  };
  return {
    tx,
    apiKey: { findFirst: vi.fn(), update: vi.fn() },
    pipeline: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() },
    pipelineStage: { findFirst: vi.fn(), findMany: vi.fn() },
    pipelineLostReason: { findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
});
const rate = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
const eventos = vi.hoisted(() => ({ registrarMudancasEmLote: vi.fn(), registrarMudancaDeEtapa: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/rate-limit", () => rate);
vi.mock("@/lib/server/stage-events", () => eventos);

import { POST } from "./route";
import { DELETE, GET as LER } from "./[id]/route";
import { DELETE as APAGAR_ETAPA } from "./[id]/stages/[stageId]/route";
import { GET as MOTIVOS } from "./[id]/lost-reasons/route";
import { POST as REORDENAR } from "./reorder/route";

const req = (method: string, body?: unknown, url = "https://eva.test/api/v1/pipelines") =>
  new Request(url, { method, headers: { authorization: "Bearer evs_live_abc" }, body: body === undefined ? undefined : JSON.stringify(body) });
const semParams = { params: Promise.resolve({}) } as { params: Promise<Record<string, never>> };

beforeEach(() => {
  vi.clearAllMocks();
  db.apiKey.findFirst.mockResolvedValue({ id: "k1", orgId: "o1", scopes: ["pipelines:write"] });
  db.apiKey.update.mockResolvedValue({});
  rate.checkRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 300, resetSec: 60 });
});

describe("GET /v1/pipelines/{id}/lost-reasons", () => {
  const umFunil = { params: Promise.resolve({ id: "1" }) };
  const url = "https://eva.test/api/v1/pipelines/1/lost-reasons";

  it("funil sem motivos salvos devolve os padrão; com salvos, os do funil", async () => {
    db.apiKey.findFirst.mockResolvedValue({ id: "k1", orgId: "o1", scopes: ["pipelines:read"] });
    db.pipeline.findFirst.mockResolvedValue({ id: "p1", numero: 1 });
    db.pipelineLostReason.findMany.mockResolvedValueOnce([]);
    const r1 = await (await MOTIVOS(req("GET", undefined, url), umFunil)).json();
    expect(r1.data[0]).toEqual({ id: "default:price", label: "Preço", requires_note: false });
    expect(r1).toMatchObject({ has_more: false, next_cursor: null });

    db.pipelineLostReason.findMany.mockResolvedValueOnce([{ id: "m1", label: "Fechou com outro", requiresNote: true }]);
    const r2 = await (await MOTIVOS(req("GET", undefined, url), umFunil)).json();
    expect(r2.data).toEqual([{ id: "m1", label: "Fechou com outro", requires_note: true }]);
    expect(db.pipeline.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: "o1", numero: 1 } }));
  });

  it("funil de outra org (ou inexistente): 404", async () => {
    db.apiKey.findFirst.mockResolvedValue({ id: "k1", orgId: "o1", scopes: ["pipelines:read"] });
    db.pipeline.findFirst.mockResolvedValue(null);
    expect((await MOTIVOS(req("GET", undefined, url), umFunil)).status).toBe(404);
  });
});

describe("/v1/pipelines", () => {
  it("mesmos limites da tela: 21 etapas é 400 limit_exceeded", async () => {
    const stages = Array.from({ length: 21 }, (_, i) => ({ name: `E${i}` }));
    const res = await POST(req("POST", { name: "Vendas", stages }), semParams);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("limit_exceeded");
    expect(db.pipeline.create).not.toHaveBeenCalled();
  });

  it("ganho vale 100 e perdido 0, seja qual for a probabilidade enviada", async () => {
    db.pipeline.count.mockResolvedValue(1);
    db.pipeline.create.mockResolvedValue({ id: "p2" });
    db.pipeline.findFirst.mockResolvedValue({ id: "p2", numero: 2, name: "Pós", isDefault: false, position: 1, createdAt: new Date(), stages: [], _count: { deals: 0 } });
    const res = await POST(
      req("POST", { name: "Pós", stages: [{ name: "Ganho", type: "won", probability: 3 }, { name: "Perdido", type: "lost", probability: 80 }] }),
      semParams
    );
    expect(res.status).toBe(201);
    expect((await res.json()).data.id).toBe(2);
    const criadas = db.pipeline.create.mock.calls[0][0].data.stages.create;
    expect(criadas.map((s: { probability: number }) => s.probability)).toEqual([100, 0]);
  });

  it("apagar funil com negócios sem move_to: 409 move_to_required com a contagem", async () => {
    db.pipeline.findFirst.mockResolvedValue({ id: "p1", numero: 1, isDefault: false });
    db.pipeline.count.mockResolvedValue(2);
    db.tx.deal.count.mockResolvedValue(3);
    const res = await DELETE(req("DELETE"), { params: Promise.resolve({ id: "1" }) });
    expect(db.pipeline.findFirst.mock.calls[0][0].where).toEqual({ orgId: "o1", numero: 1 });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({ code: "move_to_required", details: { deals: 3 } });
    expect(db.tx.pipeline.delete).not.toHaveBeenCalled();
  });

  it("funil no caminho: UUID é 400 invalid_parameter; número que não existe, 404", async () => {
    db.apiKey.findFirst.mockResolvedValue({ id: "k1", orgId: "o1", scopes: ["pipelines:read"] });
    const r1 = await LER(req("GET"), { params: Promise.resolve({ id: "8d8d3a8c-2ff6-485e-a325-17384e9990cf" }) });
    expect(r1.status).toBe(400);
    expect((await r1.json()).error).toMatchObject({ code: "invalid_parameter", param: "id" });
    db.pipeline.findFirst.mockResolvedValue(null);
    const r2 = await LER(req("GET"), { params: Promise.resolve({ id: "9" }) });
    expect(r2.status).toBe(404);
  });

  it("apagar etapa com move_to: move os negócios e grava o histórico", async () => {
    db.pipeline.findFirst.mockResolvedValue({ id: "p1", numero: 1 });
    db.pipelineStage.findFirst
      .mockResolvedValueOnce({ id: "s1" }) // etapa do caminho (número 1)
      .mockResolvedValueOnce({ id: "s2" }) // move_to (número 2)
      .mockResolvedValue({ id: "s1", pipelineId: "p1", type: "open" });
    db.pipelineStage.findMany.mockResolvedValue([
      { id: "s1", pipelineId: "p1", type: "open", probability: 10, name: "A" },
      { id: "s2", pipelineId: "p1", type: "open", probability: 30, name: "B" },
    ]);
    db.tx.deal.count.mockResolvedValue(1);
    db.tx.deal.findMany.mockResolvedValue([{ id: "d1" }]);
    const res = await APAGAR_ETAPA(req("DELETE", undefined, "https://eva.test/api/v1/pipelines/1/stages/1?move_to=2"), {
      params: Promise.resolve({ id: "1", stageId: "1" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ id: 1, deleted: true, moved_deals: 1 });
    expect(eventos.registrarMudancasEmLote).toHaveBeenCalledWith([
      { orgId: "o1", dealId: "d1", pipelineId: "p1", fromStageId: "s1", toStageId: "s2" },
    ]);
  });

  it("apagar etapa com move_to apontando para ela mesma: 400 invalid_move_to (não 409)", async () => {
    db.pipeline.findFirst.mockResolvedValue({ id: "p1", numero: 1 });
    db.pipelineStage.findFirst.mockResolvedValue({ id: "s1" });
    const res = await APAGAR_ETAPA(req("DELETE", undefined, "https://eva.test/api/v1/pipelines/1/stages/1?move_to=1"), {
      params: Promise.resolve({ id: "1", stageId: "1" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatchObject({ code: "invalid_move_to", param: "move_to" });
  });

  it("reordenar com número que não existe: 404 invalid_reference com os que faltam", async () => {
    db.pipeline.findMany.mockResolvedValue([{ id: "p1", numero: 1 }, { id: "p2", numero: 2 }]);
    const res = await REORDENAR(req("POST", { ids: [2, 7] }, "https://eva.test/api/v1/pipelines/reorder"), semParams);
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatchObject({ code: "invalid_reference", details: { missing: [7] } });
  });
});
