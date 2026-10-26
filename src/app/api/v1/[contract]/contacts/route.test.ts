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
const lix = vi.hoisted(() => ({ apagarComLixeira: vi.fn(), lerItemPeloRegistro: vi.fn(), restaurarDaLixeira: vi.fn(), lixeiraDisponivel: vi.fn() }));
vi.mock("@/lib/server/lixeira", async (original) => ({ ...(await original<object>()), ...lix }));

import { GET, POST } from "./route";
import { PUT as UPSERT } from "./upsert/route";
import { PATCH, DELETE } from "./[id]/route";
import { POST as LOTE } from "./batch/route";
import { POST as RESTAURAR } from "./[id]/restore/route";

const URL_BASE = "https://eva.test/api/v1/contacts";

function req(method: string, body?: unknown, { url = URL_BASE, headers = {} }: { url?: string; headers?: Record<string, string> } = {}) {
  return new Request(url, {
    method,
    headers: { authorization: "Bearer evs_live_abc", ...headers },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
const semParams = { params: Promise.resolve({ contract: "o1" }) } as { params: Promise<{ contract: string }> };
const p = <T extends Record<string, string>>(v: T) => ({ params: Promise.resolve({ contract: "o1", ...v }) });

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
  lix.lixeiraDisponivel.mockResolvedValue(true);
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

  it("contrato da URL diferente do da chave: 403 contract_mismatch dizendo o certo", async () => {
    const res = await GET(req("GET"), { params: Promise.resolve({ contract: "8d8d3a8c" }) });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toMatchObject({ code: "contract_mismatch", details: { contract: "o1" } });
    expect(db.contact.findMany).not.toHaveBeenCalled();
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
  it("cria e devolve telefone em +55; id de outro sistema não entra nem sai", async () => {
    db.contact.findFirst.mockResolvedValue(ficha());
    const res = await POST(req("POST", { name: "Ana", email: "ANA@x.com", phone: "(11) 99999-8888" }), semParams);
    expect(res.status).toBe(201);
    expect(db.contact.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ email: "ana@x.com", phone: "5511999998888", source: "api", orgId: "o1" }) })
    );
    const { data } = await res.json();
    expect(data).toMatchObject({ id: "c1", phone: "+5511999998888" });
    expect(data).not.toHaveProperty("external_id");

    const comExterno = await POST(req("POST", { name: "Ana", external_id: "erp-1" }), semParams);
    expect((await comExterno.json()).error).toMatchObject({ code: "unknown_field", param: "external_id" });
    expect(db.externalRef.upsert).not.toHaveBeenCalled();
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

  it("DELETE manda para a lixeira (apaga de vez só sem a lixeira no banco) e devolve a validade", async () => {
    lix.apagarComLixeira.mockResolvedValueOnce({ lixeira: true, trashId: "tr1", expiresAt: new Date("2026-11-19T12:00:00Z"), aviso: null });
    const res = await DELETE(req("DELETE"), p({ id: "c1" }));
    expect(res.status).toBe(200);
    expect(lix.apagarComLixeira).toHaveBeenCalledWith({
      orgId: "o1",
      entidade: "contact",
      id: "c1",
      quem: { id: null, nome: "API" },
      seIndisponivel: "apagar",
    });
    expect((await res.json()).data).toEqual({ id: "c1", deleted: true, trash: { expires_at: "2026-11-19T12:00:00.000Z" } });
  });

  it("DELETE sem a lixeira no banco: apaga e avisa em warning", async () => {
    lix.apagarComLixeira.mockResolvedValueOnce({ lixeira: false, trashId: null, expiresAt: null, aviso: "apagado de vez" });
    const res = await DELETE(req("DELETE"), p({ id: "c1" }));
    expect((await res.json()).data).toEqual({ id: "c1", deleted: true, trash: null, warning: "apagado de vez" });
  });

  it("POST /{id}/restore: restaura a última foto do registro; fora da lixeira, 404", async () => {
    lix.lerItemPeloRegistro.mockResolvedValueOnce({ id: "tr1" });
    lix.restaurarDaLixeira.mockResolvedValueOnce({ entidade: "contact", entityId: "c1", nome: "Ana", avisos: ["x"] });
    const res = await RESTAURAR(req("POST"), p({ id: "c1" }));
    expect(lix.lerItemPeloRegistro).toHaveBeenCalledWith("o1", "contact", "c1");
    expect((await res.json()).data).toEqual({ id: "c1", restored: true, warnings: ["x"] });

    lix.lerItemPeloRegistro.mockResolvedValueOnce(null);
    const nao = await RESTAURAR(req("POST"), p({ id: "c-outra" }));
    expect(nao.status).toBe(404);

    // Sem a lixeira no banco: 409 trash_unavailable (não um 404 enganoso).
    lix.lixeiraDisponivel.mockResolvedValueOnce(false);
    const sem = await RESTAURAR(req("POST"), p({ id: "c1" }));
    expect(sem.status).toBe(409);
    expect((await sem.json()).error.code).toBe("trash_unavailable");
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
