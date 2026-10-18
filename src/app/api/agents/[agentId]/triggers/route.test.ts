import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  agent: { findFirst: vi.fn() },
  agentTrigger: { findMany: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
}));
const auth = vi.hoisted(() => ({ requirePermission: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => auth);

import { GET, POST } from "./route";
import { PUT, DELETE } from "./[id]/route";

const params = Promise.resolve({ agentId: "a1" });
const paramsId = Promise.resolve({ agentId: "a1", id: "t1" });

function req(body?: unknown, method = "POST") {
  return new Request("https://eva.test/api", { method, body: body === undefined ? undefined : JSON.stringify(body) });
}

const valido = { name: "Promo", kind: "dm_keyword", matchMode: "exact", keywords: "promo", replyText: "Cupom EVA10" };

beforeEach(() => {
  vi.clearAllMocks();
  auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner" });
  db.agent.findFirst.mockResolvedValue({ id: "a1" });
  db.agentTrigger.findFirst.mockResolvedValue({ id: "t1" });
});

describe("API de gatilhos", () => {
  it("sem permissão devolve o erro do RBAC", async () => {
    auth.requirePermission.mockResolvedValue({ error: "Seu perfil não tem permissão para essa ação.", status: 403 });
    const res = await POST(req(valido), { params });
    expect(res.status).toBe(403);
    expect(db.agentTrigger.create).not.toHaveBeenCalled();
  });

  it("criar exige agents:manage e procura o agente dentro da org", async () => {
    db.agentTrigger.create.mockResolvedValue({ id: "t1" });
    const res = await POST(req(valido), { params });
    expect(res.status).toBe(200);
    expect(auth.requirePermission).toHaveBeenCalledWith("agents:manage");
    expect(db.agent.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "a1", orgId: "o1" } }));
    expect(db.agentTrigger.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ agentId: "a1", kind: "dm_keyword", keywords: ["promo"], matchMode: "exact" }),
    });
  });

  it("agente de outra org: 404", async () => {
    db.agent.findFirst.mockResolvedValue(null);
    expect((await POST(req(valido), { params })).status).toBe(404);
    expect((await GET(req(undefined, "GET"), { params })).status).toBe(404);
  });

  it("dado inválido: 400 com a mensagem da validação", async () => {
    const res = await POST(req({ ...valido, keywords: "" }), { params });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Informe ao menos uma palavra-chave." });
  });

  it("corpo que não é JSON: 400", async () => {
    const bad = new Request("https://eva.test/api", { method: "POST", body: "{" });
    expect((await POST(bad, { params })).status).toBe(400);
  });

  it("listar só pede leitura", async () => {
    db.agentTrigger.findMany.mockResolvedValue([]);
    const res = await GET(req(undefined, "GET"), { params });
    expect(auth.requirePermission).toHaveBeenCalledWith("read");
    expect(await res.json()).toEqual({ triggers: [] });
  });

  it("editar/excluir gatilho de outra org: 404", async () => {
    db.agentTrigger.findFirst.mockResolvedValue(null);
    expect((await PUT(req(valido, "PUT"), { params: paramsId })).status).toBe(404);
    expect((await DELETE(req(undefined, "DELETE"), { params: paramsId })).status).toBe(404);
    expect(db.agentTrigger.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "t1", agentId: "a1", agent: { orgId: "o1" } } })
    );
    expect(db.agentTrigger.update).not.toHaveBeenCalled();
    expect(db.agentTrigger.delete).not.toHaveBeenCalled();
  });

  it("editar valida e grava", async () => {
    db.agentTrigger.update.mockResolvedValue({ id: "t1" });
    const res = await PUT(req({ ...valido, active: false }, "PUT"), { params: paramsId });
    expect(res.status).toBe(200);
    expect(db.agentTrigger.update).toHaveBeenCalledWith({
      where: { id: "t1" },
      data: expect.objectContaining({ active: false }),
    });
  });
});
