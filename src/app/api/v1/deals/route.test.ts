import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  apiKey: { findFirst: vi.fn(), update: vi.fn() },
  deal: { findFirst: vi.fn(), findMany: vi.fn(), update: vi.fn(), count: vi.fn(), delete: vi.fn() },
  pipelineStage: { findFirst: vi.fn() },
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
  stage: { type: "open" },
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
  it("mesma etapa do funil: moveDealStage com origem api", async () => {
    db.pipelineStage.findFirst.mockResolvedValue({ id: "s2", pipelineId: "p1", type: "open" });
    const res = await MOVER(req("POST", { stage_id: "s2" }), p({ id: "d1" }));
    expect(res.status).toBe(200);
    expect(crm.moveDealStage).toHaveBeenCalledWith("d1", "s2", "", "api");
  });

  it("etapa de outro funil sem pipeline_id: 422; com pipeline_id: move", async () => {
    db.pipelineStage.findFirst.mockResolvedValue({ id: "x1", pipelineId: "p2", type: "open" });
    const r1 = await MOVER(req("POST", { stage_id: "x1" }), p({ id: "d1" }));
    expect(r1.status).toBe(422);
    expect((await r1.json()).error.code).toBe("stage_in_other_pipeline");
    expect(crm.moveDealStage).not.toHaveBeenCalled();

    const r2 = await MOVER(req("POST", { stage_id: "x1", pipeline_id: "p2" }), p({ id: "d1" }));
    expect(r2.status).toBe(200);
    expect(crm.moveDealStage).toHaveBeenCalledWith("d1", "x1", "", "api");
  });

  it("won procura a etapa de ganho do funil do negócio", async () => {
    db.pipelineStage.findFirst
      .mockResolvedValueOnce({ id: "sw" }) // etapa de ganho
      .mockResolvedValueOnce({ id: "sw", pipelineId: "p1", type: "won" });
    const res = await GANHAR(req("POST"), p({ id: "d1" }));
    expect(res.status).toBe(200);
    expect(db.pipelineStage.findFirst.mock.calls[0][0].where).toEqual({ pipelineId: "p1", type: "won" });
    expect(crm.moveDealStage).toHaveBeenCalledWith("d1", "sw", "", "api");
  });

  it("PATCH com campo inválido não move a etapa antes de falhar", async () => {
    db.pipelineStage.findFirst.mockResolvedValue({ id: "s2", pipelineId: "p1", type: "open" });
    db.customField.findMany.mockResolvedValue([
      { id: "f1", entity: "deal", pipelineId: null, key: "kwh", label: "Consumo", type: "number", options: [], required: false, helpText: "", showOnCard: false, position: 0 },
    ]);
    const res = await PATCH(req("PATCH", { stage_id: "s2", custom_fields: { kwh: "muito" } }), p({ id: "d1" }));
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
