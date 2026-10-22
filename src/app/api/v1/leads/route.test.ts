import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  contact: { updateMany: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  agent: { findFirst: vi.fn() },
  conversation: { findFirst: vi.fn(), delete: vi.fn() },
}));
const keys = vi.hoisted(() => ({ requireApiKeyOrgId: vi.fn() }));
const rate = vi.hoisted(() => ({ checkRateLimit: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/api-keys", () => keys);
vi.mock("@/lib/server/rate-limit", () => rate);
vi.mock("@/lib/server/custom-fields", () => ({ normalizarCapturados: vi.fn(async () => undefined) }));

import { GET, POST } from "./route";
import { GET as GET_ID, PATCH, DELETE } from "./[id]/route";

function req(body?: unknown, method = "POST", url = "https://eva.test/api/v1/leads") {
  return new Request(url, {
    method,
    headers: { authorization: "Bearer evs_live_x" },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}
const p = (id: string) => ({ params: Promise.resolve({ id }) });

const contatoLead = {
  id: "c1",
  name: "Ana",
  email: "ana@x.com",
  phone: "",
  customFields: { origem: "feira" },
  leadStage: "novo",
  leadAt: new Date("2026-10-19T10:00:00Z"),
  leadAgentId: "a1",
  leadChannel: "website",
  updatedAt: new Date("2026-10-19T11:00:00Z"),
  conversations: [{ id: "conv1", agentId: "a1", channel: "website", contactId: "site-123", agent: { name: "V" }, messages: [] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  keys.requireApiKeyOrgId.mockResolvedValue("o1");
  rate.checkRateLimit.mockResolvedValue({ allowed: true });
  db.agent.findFirst.mockResolvedValue({ id: "a1" });
  db.contact.findMany.mockResolvedValue([]);
  db.contact.findFirst.mockImplementation(async ({ where }) => (where.id === "c1" && where.orgId === "o1" ? contatoLead : null));
  db.contact.create.mockImplementation(async () => ({ id: "c1" }));
  db.contact.updateMany.mockResolvedValue({ count: 1 });
  db.conversation.findFirst.mockResolvedValue(null);
});

describe("/api/v1/leads", () => {
  it("chave inválida: 401; limite: 429", async () => {
    keys.requireApiKeyOrgId.mockResolvedValueOnce(null);
    expect((await GET(req(undefined, "GET"))).status).toBe(401);
    rate.checkRateLimit.mockResolvedValueOnce({ allowed: false });
    expect((await GET(req(undefined, "GET"))).status).toBe(429);
  });

  it("GET lista no formato público (chaves antigas + novas)", async () => {
    db.contact.findMany.mockResolvedValue([contatoLead]);
    const res = await GET(req(undefined, "GET", "https://eva.test/api/v1/leads?stage=novo&limit=10"));
    expect(db.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: "o1", leadStage: "novo" }, take: 10 }));
    const { data } = await res.json();
    expect(data[0]).toEqual({
      id: "c1",
      agentId: "a1",
      contactId: "site-123",
      stage: "novo",
      fields: { nome: "Ana", email: "ana@x.com", origem: "feira" },
      name: "Ana",
      email: "ana@x.com",
      phone: "",
      channel: "website",
      conversationId: "conv1",
      createdAt: "2026-10-19T10:00:00.000Z",
      updatedAt: "2026-10-19T11:00:00.000Z",
    });
  });

  it("GET com stage inválido: 400", async () => {
    expect((await GET(req(undefined, "GET", "https://eva.test/api/v1/leads?stage=vip"))).status).toBe(400);
  });

  it("POST cria: 201 com data.id = id do contato", async () => {
    const res = await POST(req({ agentId: "a1", fields: { nome: "Ana", email: "ana@x.com" }, stage: "novo" }));
    expect(res.status).toBe(201);
    expect((await res.json()).data.id).toBe("c1");
    expect(db.contact.create).toHaveBeenCalledWith({ data: expect.objectContaining({ source: "api", leadChannel: "api" }) });
  });

  it("POST: e-mail inválido 400 com fieldErrors; JSON inválido 400; contactId não-texto 400; stage inválido 400", async () => {
    const res = await POST(req({ agentId: "a1", fields: { email: "x@" } }));
    expect(res.status).toBe(400);
    expect((await res.json()).fieldErrors).toEqual({ email: "E-mail inválido." });
    expect((await POST(req("{"))).status).toBe(400);
    expect((await POST(req({ agentId: "a1", fields: {}, contactId: 9 }))).status).toBe(400);
    expect((await POST(req({ agentId: "a1", fields: {}, stage: "vip" }))).status).toBe(400);
    expect((await POST(req({ agentId: "a1" }))).status).toBe(400);
  });

  it("POST com agente de outra org: 404", async () => {
    db.agent.findFirst.mockResolvedValue(null);
    expect((await POST(req({ agentId: "x", fields: { nome: "Ana" } }))).status).toBe(404);
  });

  it("GET /:id com id antigo de conversa resolve para o contato", async () => {
    db.conversation.findFirst.mockResolvedValue({ contactRecordId: "c1" });
    const res = await GET_ID(req(undefined, "GET"), p("conv-antiga"));
    expect(res.status).toBe(200);
    expect((await res.json()).data.id).toBe("c1");
  });

  it("PATCH: e-mail inválido 400; ok mescla fields e muda stage", async () => {
    expect((await PATCH(req({ fields: { email: "x@" } }, "PATCH"), p("c1"))).status).toBe(400);
    const res = await PATCH(req({ stage: "ganho", fields: { cidade: "SP" } }, "PATCH"), p("c1"));
    expect(res.status).toBe(200);
    expect(db.contact.update).toHaveBeenCalledWith({
      where: { id: "c1" },
      data: { leadStage: "ganho", customFields: { origem: "feira", cidade: "SP" } },
    });
  });

  it("PATCH com stage inválido / JSON inválido: 400", async () => {
    expect((await PATCH(req({ stage: "vip" }, "PATCH"), p("c1"))).status).toBe(400);
    expect((await PATCH(req("[", "PATCH"), p("c1"))).status).toBe(400);
  });

  it("DELETE tira da lista sem apagar e responde deleted/removed", async () => {
    const res = await DELETE(req(undefined, "DELETE"), p("c1"));
    expect(await res.json()).toEqual({ data: { deleted: true, removed: true } });
    expect(db.contact.updateMany).toHaveBeenCalledWith({ where: { id: "c1", orgId: "o1", leadStage: { not: null } }, data: { leadStage: null } });
    expect(db.contact.delete).not.toHaveBeenCalled();
    expect(db.conversation.delete).not.toHaveBeenCalled();
  });

  it("lead inexistente: 404", async () => {
    expect((await GET_ID(req(undefined, "GET"), p("zz"))).status).toBe(404);
    expect((await DELETE(req(undefined, "DELETE"), p("zz"))).status).toBe(404);
  });
});
