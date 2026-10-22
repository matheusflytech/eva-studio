import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({
  contact: { updateMany: vi.fn(), findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  agent: { findFirst: vi.fn(), findUnique: vi.fn() },
  conversation: { findFirst: vi.fn(), delete: vi.fn() },
}));
const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => auth);
vi.mock("@/lib/server/custom-fields", () => ({ normalizarCapturados: vi.fn(async () => undefined) }));

import { GET, POST } from "./route";
import { GET as GET_ID, PATCH, DELETE } from "./[id]/route";

const paramsId = { params: Promise.resolve({ id: "c1" }) };

function req(body?: unknown, method = "POST", headers: Record<string, string> = {}) {
  return new Request("https://eva.test/api/leads", {
    method,
    headers,
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

const contatoLead = {
  id: "c1",
  name: "Ana",
  email: "ana@x.com",
  phone: "+5511987654321",
  customFields: {},
  leadStage: "novo",
  leadAt: new Date("2026-10-19T10:00:00Z"),
  leadAgentId: "a1",
  leadChannel: "instagram",
  updatedAt: new Date("2026-10-19T11:00:00Z"),
  conversations: [{ id: "conv1", agentId: "a1", channel: "instagram", contactId: "ig-1", agent: { name: "Vendedor" }, messages: [] }],
};

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
  db.agent.findFirst.mockResolvedValue({ id: "a1" });
  db.contact.findFirst.mockResolvedValue(null);
  db.contact.findMany.mockResolvedValue([]);
  db.contact.create.mockImplementation(async ({ data }) => ({ id: "novo", ...data }));
  db.contact.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/leads", () => {
  it("lista contatos com leadStage de qualquer canal, exige 'read'", async () => {
    db.contact.findMany.mockResolvedValue([contatoLead]);
    const res = await GET();
    expect(auth.requirePermission).toHaveBeenCalledWith("read");
    expect(db.contact.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: "o1", leadStage: { not: null } } }));
    const { leads } = await res.json();
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ id: "c1", stage: "novo", channel: "instagram", conversationId: "conv1", fields: { nome: "Ana" } });
  });

  it("sem sessão: 401", async () => {
    auth.requirePermission.mockResolvedValue({ error: "Não autenticado.", status: 401 });
    expect((await GET()).status).toBe(401);
  });
});

describe("POST /api/leads", () => {
  it("cria contato-lead com fields/stage e exige contacts:manage", async () => {
    const res = await POST(req({ agentId: "a1", fields: { nome: "Ana", email: "ana@x.com" }, stage: "contatado" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: "novo" });
    expect(auth.requirePermission).toHaveBeenCalledWith("contacts:manage");
    expect(db.contact.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ orgId: "o1", name: "Ana", email: "ana@x.com", leadStage: "contatado", source: "manual" }),
    });
  });

  it("aceita os nomes antigos variables/leadStage", async () => {
    await POST(req({ agentId: "a1", variables: { nome: "Bia" }, leadStage: "qualificado" }));
    expect(db.contact.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: "Bia", leadStage: "qualificado" }) });
  });

  it("deduplica por e-mail: atualiza em vez de criar", async () => {
    db.contact.findFirst.mockResolvedValue({ id: "c9", name: "", email: "ana@x.com", phone: "", customFields: {}, leadStage: null });
    const res = await POST(req({ agentId: "a1", fields: { email: "ana@x.com" } }));
    expect(await res.json()).toEqual({ id: "c9" });
    expect(db.contact.create).not.toHaveBeenCalled();
    expect(db.contact.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "c9" } }));
  });

  it("telefone com DDD diferente não é o mesmo contato", async () => {
    db.contact.findMany.mockResolvedValue([{ id: "rj", phone: "+5521977776666", name: "", email: "", customFields: {}, leadStage: "novo" }]);
    const res = await POST(req({ agentId: "a1", fields: { telefone: "11977776666" } }));
    expect(await res.json()).toEqual({ id: "novo" });
    expect(db.contact.update).not.toHaveBeenCalled();
  });

  it("viewer: 403 e nada gravado", async () => {
    auth.requirePermission.mockResolvedValue({ error: "Seu perfil não tem permissão para essa ação.", status: 403 });
    const res = await POST(req({ agentId: "a1", fields: { nome: "Ana" } }));
    expect(res.status).toBe(403);
    expect(db.contact.create).not.toHaveBeenCalled();
  });

  it("JSON inválido: 400", async () => {
    const res = await POST(req("{"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/JSON/);
  });

  it("stage fora da lista: 400", async () => {
    const res = await POST(req({ agentId: "a1", fields: { nome: "Ana" }, stage: "vip" }));
    expect(res.status).toBe(400);
    expect(db.contact.create).not.toHaveBeenCalled();
  });

  it("contactId e agentId com tipo errado: 400 (não 500)", async () => {
    expect((await POST(req({ agentId: "a1", fields: {}, contactId: 123 }))).status).toBe(400);
    expect((await POST(req({ agentId: 5, fields: {} }))).status).toBe(400);
    expect((await POST(req({ agentId: "a1", fields: "x" }))).status).toBe(400);
  });

  it("e-mail inválido: 400 com fieldErrors", async () => {
    const res = await POST(req({ agentId: "a1", fields: { email: "ana@" } }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Dados inválidos.", fieldErrors: { email: "E-mail inválido." } });
  });

  it("agente de outra org: 404", async () => {
    db.agent.findFirst.mockResolvedValue(null);
    expect((await POST(req({ agentId: "x", fields: { nome: "Ana" } }))).status).toBe(404);
  });

  it("X-Internal-Secret: sem sessão, org vem do agente", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "segredo");
    db.agent.findUnique.mockResolvedValue({ orgId: "o7" });
    const res = await POST(req({ agentId: "a1", variables: { nome: "Ana" } }, "POST", { "x-internal-secret": "segredo" }));
    expect(res.status).toBe(200);
    expect(auth.requirePermission).not.toHaveBeenCalled();
    expect(db.contact.create).toHaveBeenCalledWith({ data: expect.objectContaining({ orgId: "o7", source: "api" }) });
  });

  it("X-Internal-Secret com agente inexistente: 404", async () => {
    vi.stubEnv("INTERNAL_API_SECRET", "segredo");
    db.agent.findUnique.mockResolvedValue(null);
    const res = await POST(req({ agentId: "zz", fields: {} }, "POST", { "x-internal-secret": "segredo" }));
    expect(res.status).toBe(404);
  });
});

describe("/api/leads/[id]", () => {
  beforeEach(() => {
    // resolverIdDoLead acha o contato; atualizarLead/buscarLead acham o lead.
    db.contact.findFirst.mockImplementation(async ({ where }) => (where.id === "c1" && where.orgId === "o1" ? contatoLead : null));
  });

  it("GET devolve o lead", async () => {
    const res = await GET_ID(req(undefined, "GET"), paramsId);
    expect(res.status).toBe(200);
    expect((await res.json()).lead).toMatchObject({ id: "c1", stage: "novo" });
  });

  it("PATCH muda a etapa (aceita stage e leadStage)", async () => {
    let res = await PATCH(req({ stage: "ganho" }, "PATCH"), paramsId);
    expect(res.status).toBe(200);
    expect(db.contact.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { leadStage: "ganho" } });
    res = await PATCH(req({ leadStage: "perdido" }, "PATCH"), paramsId);
    expect(res.status).toBe(200);
    expect(db.contact.update).toHaveBeenLastCalledWith({ where: { id: "c1" }, data: { leadStage: "perdido" } });
    expect(auth.requirePermission).toHaveBeenCalledWith("contacts:manage");
  });

  it("PATCH recusa stage inválido", async () => {
    const res = await PATCH(req({ stage: "vip" }, "PATCH"), paramsId);
    expect(res.status).toBe(400);
    expect(db.contact.update).not.toHaveBeenCalled();
  });

  it("PATCH com JSON inválido: 400", async () => {
    expect((await PATCH(req("nao-json", "PATCH"), paramsId)).status).toBe(400);
  });

  it("PATCH/DELETE de viewer: 403", async () => {
    auth.requirePermission.mockResolvedValue({ error: "Seu perfil não tem permissão para essa ação.", status: 403 });
    expect((await PATCH(req({ stage: "ganho" }, "PATCH"), paramsId)).status).toBe(403);
    expect((await DELETE(req(undefined, "DELETE"), paramsId)).status).toBe(403);
    expect(db.contact.update).not.toHaveBeenCalled();
    expect(db.contact.updateMany).not.toHaveBeenCalled();
  });

  it("DELETE tira da lista (leadStage=null) sem apagar contato nem conversa", async () => {
    const res = await DELETE(req(undefined, "DELETE"), paramsId);
    expect(res.status).toBe(200);
    expect(db.contact.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", orgId: "o1", leadStage: { not: null } },
      data: { leadStage: null },
    });
    expect(db.contact.delete).not.toHaveBeenCalled();
    expect(db.conversation.delete).not.toHaveBeenCalled();
  });

  it("id antigo de conversa resolve para o contato", async () => {
    db.conversation.findFirst.mockResolvedValue({ contactRecordId: "c1" });
    const res = await DELETE(req(undefined, "DELETE"), { params: Promise.resolve({ id: "conv-antiga" }) });
    expect(res.status).toBe(200);
    expect(db.contact.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: "c1" }) }));
  });

  it("lead de outra org / inexistente: 404", async () => {
    db.conversation.findFirst.mockResolvedValue(null);
    const outro = { params: Promise.resolve({ id: "zz" }) };
    expect((await PATCH(req({ stage: "ganho" }, "PATCH"), outro)).status).toBe(404);
    expect((await DELETE(req(undefined, "DELETE"), outro)).status).toBe(404);
    expect((await GET_ID(req(undefined, "GET"), outro)).status).toBe(404);
  });
});
