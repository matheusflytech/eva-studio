import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  apiKey: { findFirst: vi.fn(), update: vi.fn() },
  deal: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn(), delete: vi.fn() },
  pipeline: { findFirst: vi.fn(), findMany: vi.fn() },
  pipelineStage: { findFirst: vi.fn(), findMany: vi.fn() },
  dealContact: { createMany: vi.fn(), findMany: vi.fn() },
  externalRef: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  contact: { count: vi.fn() },
  customField: { findMany: vi.fn() },
  profile: { findFirst: vi.fn() },
  company: { findFirst: vi.fn() },
}));
const rate = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
const crm = vi.hoisted(() => ({
  createDeal: vi.fn(),
  moveDealStage: vi.fn(),
  resolverEtapaDeEntrada: vi.fn(),
  TIPOS_DE_TAREFA: ["ligar", "email", "reuniao", "outro"],
  parseRelativeDue: vi.fn(),
  ErroDeCrm: class ErroDeCrm extends Error {
    constructor(
      m: string,
      public status = 400
    ) {
      super(m);
    }
  },
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/rate-limit", () => rate);
vi.mock("@/lib/server/crm", () => crm);

import { POST, GET } from "./route";
import { ErroDaMudanca } from "@/lib/server/regras-de-etapa";
import { POST as MOVER } from "./[id]/move/route";
import { POST as GANHAR } from "./[id]/won/route";
import { PATCH } from "./[id]/route";
import { PUT as POR_EXTERNO } from "./by-external-id/[externalId]/route";

const req = (method: string, body?: unknown, url = "https://eva.test/api/v1/deals") =>
  new Request(url, {
    method,
    headers: { authorization: "Bearer evs_live_abc" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const semParams = { params: Promise.resolve({}) } as { params: Promise<Record<string, never>> };
const p = <T extends Record<string, string>>(v: T) => ({ params: Promise.resolve(v) });

const negocio = (extra: Record<string, unknown> = {}) => ({
  id: "d1",
  orgId: "o1",
  pipelineId: "p1",
  stageId: "s1",
  companyId: null,
  ownerId: null,
  name: "Proposta",
  description: "",
  category: "",
  amountCents: 1000,
  currency: "BRL",
  probability: 10,
  lostReason: "",
  expectedClosingAt: null,
  closedAt: null,
  archivedAt: null,
  position: 0,
  stageSince: new Date("2026-10-20T00:00:00Z"),
  customFields: {},
  createdAt: new Date("2026-10-20T00:00:00Z"),
  updatedAt: new Date("2026-10-20T00:00:00Z"),
  stage: { type: "open", numero: 1 },
  pipeline: { numero: 1 },
  contacts: [],
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.apiKey.findFirst.mockResolvedValue({ id: "k1", orgId: "o1", scopes: ["deals:*"] });
  db.apiKey.update.mockResolvedValue({});
  rate.checkRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 300, resetSec: 60 });
  db.deal.findFirst.mockResolvedValue(negocio());
  db.externalRef.findUnique.mockResolvedValue(null);
  db.externalRef.findMany.mockResolvedValue([]);
  db.customField.findMany.mockResolvedValue([]);
  crm.resolverEtapaDeEntrada.mockResolvedValue({ id: "s1", pipelineId: "p1" });
  crm.createDeal.mockResolvedValue({ id: "d1" });
});

describe("POST /v1/deals", () => {
  it("cria por createDeal com origem api e amount em centavos; amount em reais é apelido", async () => {
    db.contact.count.mockResolvedValue(1);
    const res = await POST(req("POST", { name: "Proposta", amount: "1.500,50", contact_id: "c1", external_id: "erp-d1" }), semParams);
    expect(res.status).toBe(201);
    expect(crm.createDeal).toHaveBeenCalledWith(
      expect.objectContaining({ orgId: "o1", amountCents: 150050, contactId: "c1", origem: "api", pipelineId: "p1", stageId: "s1" })
    );
    expect(db.externalRef.upsert).toHaveBeenCalled();
  });

  it("external_id já usado: 409 duplicate; contato de outra org: 404", async () => {
    db.externalRef.findUnique.mockResolvedValueOnce({ entityId: "d9" });
    const r1 = await POST(req("POST", { name: "X", external_id: "erp-d1" }), semParams);
    expect((await r1.json()).error).toMatchObject({ code: "duplicate", details: { existing_id: "d9" } });
    db.contact.count.mockResolvedValue(0);
    const r2 = await POST(req("POST", { name: "X", contact_ids: ["c-outra-org"] }), semParams);
    expect(r2.status).toBe(404);
    expect(crm.createDeal).not.toHaveBeenCalled();
  });

  it("filtro status inválido: 400", async () => {
    const res = await GET(req("GET", undefined, "https://eva.test/api/v1/deals?status=fechado"), semParams);
    expect((await res.json()).error.param).toBe("status");
  });
});

describe("mover etapa", () => {
  it("mesma etapa do funil: moveDealStage com origem api; funil e etapa saem pelo número", async () => {
    db.pipelineStage.findFirst.mockResolvedValue({ id: "s2", pipelineId: "p1", type: "open" });
    const res = await MOVER(req("POST", { stage_id: 2 }), p({ id: "d1" }));
    expect(res.status).toBe(200);
    expect(db.pipelineStage.findFirst.mock.calls[0][0].where).toEqual({ orgId: "o1", numero: 2 });
    expect(crm.moveDealStage).toHaveBeenCalledWith("d1", "s2", expect.objectContaining({ origem: "api", reabrir: false }));
    expect((await res.json()).data).toMatchObject({ pipeline_id: 1, stage_id: 1 });
  });

  it("stage_id com UUID: 400 invalid_parameter; número que não existe: 404 invalid_reference", async () => {
    const r1 = await MOVER(req("POST", { stage_id: "8d8d3a8c-2ff6-485e-a325-17384e9990cf" }), p({ id: "d1" }));
    expect(r1.status).toBe(400);
    expect((await r1.json()).error).toMatchObject({ code: "invalid_parameter", param: "stage_id" });
    db.pipelineStage.findFirst.mockResolvedValue(null);
    const r2 = await MOVER(req("POST", { stage_id: "99" }), p({ id: "d1" }));
    expect(r2.status).toBe(404);
    expect((await r2.json()).error).toMatchObject({ code: "invalid_reference", param: "stage_id" });
    expect(crm.moveDealStage).not.toHaveBeenCalled();
  });

  it("etapa de outro funil sem pipeline_id: 422; com pipeline_id: move", async () => {
    db.pipelineStage.findFirst.mockResolvedValue({ id: "x1", pipelineId: "p2", type: "open" });
    db.pipeline.findMany.mockResolvedValue([{ id: "p1", numero: 1 }, { id: "p2", numero: 2 }]);
    const r1 = await MOVER(req("POST", { stage_id: 7 }), p({ id: "d1" }));
    expect(r1.status).toBe(422);
    expect((await r1.json()).error).toMatchObject({ code: "stage_in_other_pipeline", details: { deal_pipeline_id: 1, stage_pipeline_id: 2 } });
    expect(crm.moveDealStage).not.toHaveBeenCalled();

    db.pipeline.findFirst.mockResolvedValue({ id: "p2" });
    const r2 = await MOVER(req("POST", { stage_id: 7, pipeline_id: 2 }), p({ id: "d1" }));
    expect(r2.status).toBe(200);
    expect(crm.moveDealStage).toHaveBeenCalledWith("d1", "x1", expect.objectContaining({ origem: "api" }));
  });

  it("won procura a etapa de ganho do funil do negócio", async () => {
    db.pipelineStage.findFirst
      .mockResolvedValueOnce({ id: "sw" }) // etapa de ganho
      .mockResolvedValueOnce({ id: "sw", pipelineId: "p1", type: "won" });
    const res = await GANHAR(req("POST"), p({ id: "d1" }));
    expect(res.status).toBe(200);
    expect(db.pipelineStage.findFirst.mock.calls[0][0].where).toEqual({ pipelineId: "p1", type: "won" });
    expect(crm.moveDealStage).toHaveBeenCalledWith("d1", "sw", expect.objectContaining({ origem: "api" }));
  });

  it("regras da etapa: faltou campo → 422 stage_requirements_missing com a lista", async () => {
    db.pipelineStage.findFirst.mockResolvedValue({ id: "s2", pipelineId: "p1", type: "open" });
    crm.moveDealStage.mockRejectedValueOnce(
      new ErroDaMudanca("Para mover para Proposta, preencha: Valor.", 422, "campos_obrigatorios", [
        { campo: "valor", rotulo: "Valor", etapaId: "s2", etapa: "Proposta" },
      ])
    );
    db.pipelineStage.findMany.mockResolvedValue([{ id: "s2", numero: 2 }]);
    const res = await MOVER(req("POST", { stage_id: 2 }), p({ id: "d1" }));
    expect(res.status).toBe(422);
    const corpo = await res.json();
    expect(corpo.error.code).toBe("stage_requirements_missing");
    expect(corpo.error.details.missing_fields).toEqual([{ field: "valor", label: "Valor", stage_id: 2, stage_name: "Proposta" }]);
  });

  it("negócio fechado sem reopen → 409 deal_closed; reopen e motivo estruturado seguem para moveDealStage", async () => {
    db.pipelineStage.findFirst.mockResolvedValue({ id: "s2", pipelineId: "p1", type: "open" });
    crm.moveDealStage.mockRejectedValueOnce(new ErroDaMudanca("Este negócio está ganho.", 409, "negocio_fechado"));
    const r1 = await MOVER(req("POST", { stage_id: 2 }), p({ id: "d1" }));
    expect(r1.status).toBe(409);
    expect((await r1.json()).error.code).toBe("deal_closed");

    await MOVER(req("POST", { stage_id: 2, reopen: true, lost_reason_id: "m1", lost_note: "x" }), p({ id: "d1" }));
    expect(crm.moveDealStage).toHaveBeenLastCalledWith(
      "d1",
      "s2",
      expect.objectContaining({ reabrir: true, perda: { motivoId: "m1", motivo: null, nota: "x" } })
    );
  });

  it("PATCH: valida a etapa (simulando) com os campos do mesmo PATCH, grava os campos e só depois move", async () => {
    db.pipelineStage.findFirst.mockResolvedValue({ id: "s2", pipelineId: "p1", type: "open" });
    db.customField.findMany.mockResolvedValue([]);
    const res = await PATCH(req("PATCH", { stage_id: 2, amount_cents: 5000 }), p({ id: "d1" }));
    expect(res.status).toBe(200);
    const [simulado, real] = crm.moveDealStage.mock.calls;
    expect(simulado[2]).toMatchObject({ simular: true, pendente: { amountCents: 5000 } });
    expect(real[2]).toMatchObject({ pendente: { amountCents: 5000 } });
    expect(real[2].simular).toBeFalsy();
    expect(db.deal.update.mock.invocationCallOrder[0]).toBeLessThan(crm.moveDealStage.mock.invocationCallOrder[1]);
  });

  it("PATCH com campo inválido não move a etapa antes de falhar", async () => {
    db.pipelineStage.findFirst.mockResolvedValue({ id: "s2", pipelineId: "p1", type: "open" });
    db.customField.findMany.mockResolvedValue([
      { id: "f1", entity: "deal", pipelineId: null, key: "kwh", label: "Consumo", type: "number", options: [], required: false, helpText: "", showOnCard: false, position: 0 },
    ]);
    const res = await PATCH(req("PATCH", { stage_id: "2", custom_fields: { kwh: "muito" } }), p({ id: "d1" }));
    expect(res.status).toBe(422);
    expect(crm.moveDealStage).not.toHaveBeenCalled();
    expect(db.deal.update).not.toHaveBeenCalled();
  });
});

describe("PUT /v1/deals/by-external-id", () => {
  it("existente: atualiza; nada mudou: unchanged", async () => {
    db.externalRef.findUnique.mockResolvedValue({ entityId: "d1" });
    db.externalRef.findMany.mockResolvedValue([{ entityId: "d1", externalId: "erp-d1" }]);
    const r1 = await POR_EXTERNO(req("PUT", { amount_cents: 5000 }), p({ externalId: "erp-d1" }));
    expect((await r1.json()).result).toBe("updated");
    expect(db.deal.update).toHaveBeenCalledWith({ where: { id: "d1" }, data: { amountCents: 5000 } });

    db.deal.update.mockClear();
    const r2 = await POR_EXTERNO(req("PUT", { amount_cents: 1000 }), p({ externalId: "erp-d1" }));
    expect((await r2.json()).result).toBe("unchanged");
    expect(db.deal.update).not.toHaveBeenCalled();
  });
});
