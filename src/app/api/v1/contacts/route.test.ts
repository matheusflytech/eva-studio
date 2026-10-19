import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  apiKey: { findFirst: vi.fn(), update: vi.fn() },
  idempotencyKey: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), deleteMany: vi.fn() },
  contact: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), count: vi.fn(), delete: vi.fn() },
  externalRef: { findUnique: vi.fn(), findMany: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  deletedRecord: { create: vi.fn() },
  customField: { findMany: vi.fn() },
  tag: { count: vi.fn() },
  contactTag: { findUnique: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
  company: { findFirst: vi.fn() },
  profile: { findFirst: vi.fn() },
  sequenceEnrollment: { updateMany: vi.fn() },
}));
const rate = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));
const seq = vi.hoisted(() => ({ enrollContactByTag: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/rate-limit", () => rate);
vi.mock("@/lib/server/sequences", () => seq);

import { GET, POST } from "./route";
import { PUT as UPSERT } from "./upsert/route";
import { PUT as POR_EXTERNO } from "./by-external-id/[externalId]/route";
import { PATCH, DELETE } from "./[id]/route";
import { POST as LOTE } from "./batch/route";

const URL_BASE = "https://eva.test/api/v1/contacts";

function req(method: string, body?: unknown, { url = URL_BASE, headers = {} }: { url?: string; headers?: Record<string, string> } = {}) {
  return new Request(url, {
    method,
    headers: { authorization: "Bearer evs_live_abc", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
const semParams = { params: Promise.resolve({}) } as { params: Promise<Record<string, never>> };
const p = <T extends Record<string, string>>(v: T) => ({ params: Promise.resolve(v) });

const ficha = (extra: Record<string, unknown> = {}) => ({
  id: "c1",
  orgId: "o1",
  name: "Ana",
  email: "ana@x.com",
  phone: "5511999998888",
  jobTitle: "",
  emails: [],
  phones: [],
  linkedinUrl: "",
  background: "",
  notes: "",
  customFields: {},
  source: "api",
  optIn: true,
  optOutAt: null,
  leadStage: null,
  companyId: null,
  ownerId: null,
  lastSeenAt: new Date("2026-10-20T10:00:00Z"),
  createdAt: new Date("2026-10-20T10:00:00Z"),
  updatedAt: new Date("2026-10-20T10:00:00Z"),
  tags: [],
  channels: [],
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.apiKey.findFirst.mockResolvedValue({ id: "k1", orgId: "o1", scopes: ["*"] });
  db.apiKey.update.mockResolvedValue({});
  rate.checkRateLimit.mockResolvedValue({ allowed: true, count: 1, limit: 300, resetSec: 42 });
  db.customField.findMany.mockResolvedValue([]);
  db.externalRef.findUnique.mockResolvedValue(null);
  db.externalRef.findMany.mockResolvedValue([]);
  db.contact.findMany.mockResolvedValue([]);
  db.contact.findFirst.mockResolvedValue(ficha());
  db.contact.create.mockResolvedValue({ id: "c1" });
  db.contact.update.mockResolvedValue({});
  db.idempotencyKey.findUnique.mockResolvedValue(null);
  db.idempotencyKey.create.mockResolvedValue({});
  db.idempotencyKey.update.mockResolvedValue({});
  db.idempotencyKey.deleteMany.mockResolvedValue({ count: 1 });
});

describe("envoltório da v1 (auth, escopo, limite, erro)", () => {
  it("sem chave: 401 no envelope padrão com request_id", async () => {
    db.apiKey.findFirst.mockResolvedValueOnce(null);
    const res = await GET(req("GET"), semParams);
    expect(res.status).toBe(401);
    const { error } = await res.json();
    expect(error).toMatchObject({ type: "authentication_error", code: "invalid_api_key" });
    expect(error.request_id).toMatch(/^req_/);
    expect(res.headers.get("X-Request-Id")).toBe(error.request_id);
  });

  it("chave só de leitura não escreve: 403 insufficient_scope", async () => {
    db.apiKey.findFirst.mockResolvedValueOnce({ id: "k1", orgId: "o1", scopes: ["contacts:read"] });
    const res = await POST(req("POST", { name: "Ana" }), semParams);
    expect(res.status).toBe(403);
    expect((await res.json()).error.details.required).toBe("contacts:write");
  });

  it("limite estourado: 429 com Retry-After; headers de limite em toda resposta", async () => {
    rate.checkRateLimit.mockResolvedValueOnce({ allowed: false, count: 301, limit: 300, resetSec: 17 });
    const r429 = await POST(req("POST", { name: "Ana" }), semParams);
    expect(r429.status).toBe(429);
    expect(r429.headers.get("Retry-After")).toBe("17");
    const ok = await GET(req("GET"), semParams);
    expect(ok.headers.get("RateLimit-Limit")).toBe("600");
    expect(ok.headers.get("RateLimit-Reset")).toBe("42");
    expect(rate.checkRateLimit).toHaveBeenLastCalledWith("apiv1:k1:read", 600, 60);
  });

  it("parâmetro desconhecido na lista e campo desconhecido no corpo: 400", async () => {
    const r1 = await GET(req("GET", undefined, { url: `${URL_BASE}?updatedSince=2026-01-01` }), semParams);
    expect((await r1.json()).error.code).toBe("unknown_parameter");
    const r2 = await POST(req("POST", { name: "Ana", externalId: "x" }), semParams);
    expect((await r2.json()).error).toMatchObject({ code: "unknown_field", param: "externalId" });
    const r3 = await POST(req("POST", "{nao é json"), semParams);
    expect((await r3.json()).error.code).toBe("invalid_json");
  });
});

describe("POST /v1/contacts", () => {
  it("cria com external_id e devolve telefone em +55", async () => {
    db.contact.findFirst.mockResolvedValue(ficha());
    const res = await POST(req("POST", { name: "Ana", email: "ANA@x.com", phone: "(11) 99999-8888", external_id: "erp-1" }), semParams);
    expect(res.status).toBe(201);
    expect(db.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "ana@x.com", phone: "5511999998888", source: "api", orgId: "o1" }) })
    );
    expect(db.externalRef.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ entity: "contact", externalId: "erp-1", entityId: "c1", source: "api" }) })
    );
    const { data } = await res.json();
    expect(data).toMatchObject({ id: "c1", external_id: "erp-1", phone: "+5511999998888" });
  });

  it("e-mail que já existe: 409 duplicate com o id existente (não cria)", async () => {
    db.contact.findMany.mockResolvedValueOnce([{ id: "c9" }]);
    const res = await POST(req("POST", { name: "Ana", email: "ana@x.com" }), semParams);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({ code: "duplicate", details: { existing_id: "c9", matched_by: "email" } });
    expect(db.contact.create).not.toHaveBeenCalled();
  });

  it("telefone inválido e sem identidade: 400 com param", async () => {
    const r1 = await POST(req("POST", { phone: "123" }), semParams);
    expect((await r1.json()).error).toMatchObject({ code: "invalid_phone", param: "phone" });
    const r2 = await POST(req("POST", { job_title: "CEO" }), semParams);
    expect((await r2.json()).error.code).toBe("missing_identity");
  });

  it("Idempotency-Key: repetição devolve a mesma resposta sem criar de novo", async () => {
    const primeira = await POST(req("POST", { name: "Ana" }, { headers: { "Idempotency-Key": "k-1" } }), semParams);
    expect(primeira.status).toBe(201);
    const guardada = db.idempotencyKey.update.mock.calls[0][0].data;
    const hash = db.idempotencyKey.create.mock.calls[0][0].data.bodyHash;
    db.idempotencyKey.findUnique.mockResolvedValueOnce({
      id: "i1",
      status: guardada.status,
      bodyHash: hash,
      response: guardada.response,
      createdAt: new Date(),
    });
    const repetida = await POST(req("POST", { name: "Ana" }, { headers: { "Idempotency-Key": "k-1" } }), semParams);
    expect(repetida.status).toBe(201);
    expect(repetida.headers.get("Idempotent-Replayed")).toBe("true");
    expect(db.contact.create).toHaveBeenCalledTimes(1);

    db.idempotencyKey.findUnique.mockResolvedValueOnce({ id: "i1", status: 201, bodyHash: hash, response: guardada.response, createdAt: new Date() });
    const outroCorpo = await POST(req("POST", { name: "Bia" }, { headers: { "Idempotency-Key": "k-1" } }), semParams);
    expect(outroCorpo.status).toBe(422);
    expect((await outroCorpo.json()).error.code).toBe("idempotency_key_reused");
  });
});

describe("upsert", () => {
  it("acha por e-mail e atualiza só o que mudou; unchanged quando nada muda", async () => {
    db.contact.findMany.mockResolvedValueOnce([{ id: "c1" }]);
    db.contact.findFirst.mockResolvedValueOnce(ficha()); // atualizarContato
    const res = await UPSERT(req("PUT", { email: "ana@x.com", job_title: "CEO" }), semParams);
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo).toMatchObject({ result: "updated", matched_by: "email" });
    expect(db.contact.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { jobTitle: "CEO" } });

    db.contact.update.mockClear();
    db.contact.findMany.mockResolvedValueOnce([{ id: "c1" }]);
    const igual = await UPSERT(req("PUT", { email: "ana@x.com", name: "Ana" }), semParams);
    expect((await igual.json()).result).toBe("unchanged");
    expect(db.contact.update).not.toHaveBeenCalled();
  });

  it("dois candidatos no mesmo degrau: 409 ambiguous_match com os ids", async () => {
    db.contact.findMany.mockResolvedValueOnce([{ id: "c1" }, { id: "c2" }]);
    const res = await UPSERT(req("PUT", { email: "ana@x.com" }), semParams);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({ code: "ambiguous_match", details: { ids: ["c1", "c2"] } });
  });

  it("by-external-id: id externo conhecido atualiza; desconhecido cria e liga", async () => {
    db.externalRef.findUnique.mockResolvedValueOnce({ entityId: "c1" });
    db.externalRef.findMany.mockResolvedValue([{ entityId: "c1", externalId: "erp-9" }]);
    const r1 = await POR_EXTERNO(req("PUT", { name: "Ana Paula" }), p({ externalId: "erp-9" }));
    expect((await r1.json()).matched_by).toBe("external_id");
    expect(db.contact.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { name: "Ana Paula" } });

    db.externalRef.findMany.mockResolvedValue([]);
    const r2 = await POR_EXTERNO(req("PUT", { name: "Novo" }), p({ externalId: "erp-10" }));
    expect(r2.status).toBe(201);
    expect(db.externalRef.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ externalId: "erp-10" }) }));
  });

  it("e-mail de uma ficha ligada a OUTRO external_id: 409 external_id_mismatch", async () => {
    db.contact.findMany.mockResolvedValueOnce([{ id: "c1" }]);
    db.externalRef.findMany.mockResolvedValueOnce([{ entityId: "c1", externalId: "erp-1" }]);
    const res = await UPSERT(req("PUT", { email: "ana@x.com", external_id: "erp-2" }), semParams);
    expect((await res.json()).error.code).toBe("external_id_mismatch");
  });
});

describe("PATCH/DELETE /v1/contacts/{id}", () => {
  it("chave ausente não muda; null limpa", async () => {
    db.contact.findFirst.mockResolvedValue(ficha({ companyId: "co1", notes: "antiga" }));
    const res = await PATCH(req("PATCH", { company_id: null }), p({ id: "c1" }));
    expect(res.status).toBe(200);
    expect(db.contact.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { companyId: null } });
  });

  it("contato de outra org: 404", async () => {
    db.contact.findFirst.mockResolvedValue(null);
    const res = await PATCH(req("PATCH", { name: "X" }), p({ id: "zz" }));
    expect(res.status).toBe(404);
  });

  it("DELETE apaga e grava a lápide com o external_id", async () => {
    db.externalRef.findMany.mockResolvedValueOnce([{ externalId: "erp-1", source: "api" }]);
    const res = await DELETE(req("DELETE"), p({ id: "c1" }));
    expect(res.status).toBe(200);
    expect(db.deletedRecord.create).toHaveBeenCalledWith({
      data: { orgId: "o1", entity: "contact", entityId: "c1", externalId: "erp-1" },
    });
    expect(db.contact.delete).toHaveBeenCalledWith({ where: { id: "c1" } });
  });
});

describe("POST /v1/contacts/batch", () => {
  it("exige Idempotency-Key e devolve resultado por item", async () => {
    const sem = await LOTE(req("POST", { items: [{ name: "A" }] }), semParams);
    expect((await sem.json()).error.code).toBe("idempotency_key_required");

    const res = await LOTE(
      req("POST", { items: [{ name: "A" }, { phone: "1" }] }, { headers: { "Idempotency-Key": "lote-1" } }),
      semParams
    );
    const corpo = await res.json();
    expect(corpo.data[0]).toMatchObject({ index: 0, status: "created", id: "c1" });
    expect(corpo.data[1]).toMatchObject({ index: 1, status: "error", error: { code: "invalid_phone" } });
    expect(corpo.summary).toEqual({ created: 1, updated: 0, unchanged: 0, failed: 1 });
  });
});
