import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma } from "@/generated/prisma/client";

const db = vi.hoisted(() => ({
  savedView: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  savedViewDefault: { findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn() },
  teamMember: { findMany: vi.fn() },
  team: { findFirst: vi.fn() },
  pipeline: { findFirst: vi.fn() },
  profile: { findMany: vi.fn() },
  $transaction: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

const sessao = vi.hoisted(() => ({ atual: { orgId: "org", userId: "u1", role: "agent" as string } }));
vi.mock("@/lib/server/permissions", async (orig) => {
  const real = await orig<typeof import("@/lib/server/permissions")>();
  return {
    ...real,
    requirePermission: vi.fn(async () => sessao.atual),
    getSessionContext: vi.fn(async () => sessao.atual),
  };
});

import { GET, POST } from "./route";
import { PATCH, DELETE } from "./[visaoId]/route";
import { PUT } from "./padrao/route";
import { _esquecerSondagem } from "@/lib/server/visoes-salvas";

const ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const req = (url: string, body?: unknown, method = "POST") =>
  new Request(`http://x${url}`, { method, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const params = { params: Promise.resolve({ visaoId: ID }) };
const linha = (p: Record<string, unknown> = {}) => ({
  id: ID,
  orgId: "org",
  entity: "contatos",
  pipelineId: null,
  name: "Leads quentes",
  ownerId: "u1",
  visibility: "pessoal",
  teamId: null,
  config: { visaoBase: "todos", estado: { busca: "x" } },
  position: 1,
  ...p,
});

beforeEach(() => {
  vi.clearAllMocks();
  _esquecerSondagem();
  sessao.atual = { orgId: "org", userId: "u1", role: "agent" };
  db.savedView.findFirst.mockResolvedValue(linha());
  db.savedView.findMany.mockResolvedValue([linha()]);
  db.savedView.count.mockResolvedValue(0);
  db.savedView.create.mockImplementation(async ({ data }) => ({ id: ID, ...data }));
  db.savedView.updateMany.mockResolvedValue({ count: 1 });
  db.savedViewDefault.findUnique.mockResolvedValue(null);
  db.teamMember.findMany.mockResolvedValue([{ teamId: "t1" }]);
  db.team.findFirst.mockResolvedValue({ id: "t1" });
  db.pipeline.findFirst.mockResolvedValue({ id: "p1" });
  db.profile.findMany.mockResolvedValue([{ id: "u1", name: "Ana", email: "" }]);
  db.$transaction.mockResolvedValue([]);
});

describe("GET /api/visoes", () => {
  it("lista só as visíveis, presas ao contrato e à lista", async () => {
    const res = await GET(req("/api/visoes?entidade=contatos", undefined, "GET"));
    const d = await res.json();
    expect(d.disponivel).toBe(true);
    expect(d.visoes[0]).toMatchObject({ id: ID, nome: "Leads quentes", donoNome: "Ana", podeEditar: true });
    const where = db.savedView.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe("org");
    expect(where.entity).toBe("contatos");
    expect(where.AND[0].OR).toEqual([{ ownerId: "u1" }, { visibility: "contrato" }, { visibility: "equipe", teamId: { in: ["t1"] } }]);
    // equipe só deste contrato
    expect(db.teamMember.findMany.mock.calls[0][0].where).toEqual({ userId: "u1", team: { orgId: "org" } });
  });

  it("negócios: funil filtra (visões do funil + as de todos os funis)", async () => {
    await GET(req("/api/visoes?entidade=negocios&pipeline=p1", undefined, "GET"));
    expect(db.savedView.findMany.mock.calls[0][0].where.AND[1]).toEqual({ OR: [{ pipelineId: null }, { pipelineId: "p1" }] });
  });

  it("padrão que sumiu volta a null", async () => {
    db.savedViewDefault.findUnique.mockResolvedValue({ viewKey: "11111111-1111-1111-1111-111111111111" });
    const d = await (await GET(req("/api/visoes?entidade=contatos", undefined, "GET"))).json();
    expect(d.padrao).toBeNull();
  });

  it("tabela ausente: disponivel false, sem erro", async () => {
    db.savedView.findFirst.mockRejectedValue(new Prisma.PrismaClientKnownRequestError("relation does not exist", { code: "P2021", clientVersion: "7" }));
    const d = await (await GET(req("/api/visoes?entidade=contatos", undefined, "GET"))).json();
    expect(d).toEqual({ disponivel: false, visoes: [], padrao: null });
    expect(db.savedView.findMany).not.toHaveBeenCalled();
  });

  it("lista inválida → 400", async () => {
    expect((await GET(req("/api/visoes?entidade=empresas", undefined, "GET"))).status).toBe(400);
  });
});

describe("POST /api/visoes", () => {
  it("cria pessoal do usuário logado, no contrato ativo, com config saneada", async () => {
    const res = await POST(req("/api/visoes", { entidade: "contatos", nome: "  Minha   visão ", config: { visaoBase: "meus", ownerId: "outro", estado: { tamanho: 50 } } }));
    expect(res.status).toBe(201);
    const data = db.savedView.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ orgId: "org", ownerId: "u1", entity: "contatos", name: "Minha visão", visibility: "pessoal", teamId: null, pipelineId: null });
    expect(data.config).not.toHaveProperty("ownerId");
    expect(data.config.estado.tamanho).toBe(50);
  });

  it("compartilhar com o contrato sem administrar → 403", async () => {
    const res = await POST(req("/api/visoes", { entidade: "contatos", nome: "X", visibilidade: "contrato", config: {} }));
    expect(res.status).toBe(403);
    expect(db.savedView.create).not.toHaveBeenCalled();
  });

  it("admin compartilha com o contrato", async () => {
    sessao.atual = { orgId: "org", userId: "u1", role: "owner" };
    const res = await POST(req("/api/visoes", { entidade: "contatos", nome: "X", visibilidade: "contrato", config: {} }));
    expect(res.status).toBe(201);
  });

  it("equipe que não é minha → 403; equipe de outro contrato → 404", async () => {
    expect((await POST(req("/api/visoes", { entidade: "contatos", nome: "X", visibilidade: "equipe", teamId: "t9", config: {} }))).status).toBe(403);
    db.team.findFirst.mockResolvedValue(null);
    expect((await POST(req("/api/visoes", { entidade: "contatos", nome: "X", visibilidade: "equipe", teamId: "t1", config: {} }))).status).toBe(404);
    expect(db.team.findFirst).toHaveBeenCalledWith({ where: { id: "t1", orgId: "org" }, select: { id: true } });
  });

  it("funil de outro contrato → 404", async () => {
    db.pipeline.findFirst.mockResolvedValue(null);
    const res = await POST(req("/api/visoes", { entidade: "negocios", nome: "X", pipelineId: "p-outro", config: {} }));
    expect(res.status).toBe(404);
  });

  it("sem nome → 400; limite por pessoa → 409", async () => {
    expect((await POST(req("/api/visoes", { entidade: "contatos", nome: " ", config: {} }))).status).toBe(400);
    db.savedView.count.mockResolvedValue(50);
    expect((await POST(req("/api/visoes", { entidade: "contatos", nome: "X", config: {} }))).status).toBe(409);
  });

  it("tabela ausente → 409 visoes_indisponiveis", async () => {
    db.savedView.findFirst.mockRejectedValue(new Error('relation "eva_studio_saved_views" does not exist'));
    const res = await POST(req("/api/visoes", { entidade: "contatos", nome: "X", config: {} }));
    expect(res.status).toBe(409);
    expect((await res.json()).codigo).toBe("visoes_indisponiveis");
  });
});

describe("PATCH/DELETE /api/visoes/[id]", () => {
  it("salvar alterações na minha visão grava no contrato", async () => {
    const res = await PATCH(req(`/api/visoes/${ID}`, { nome: "Novo", config: { estado: { busca: "b" } } }, "PATCH"), params);
    expect(res.status).toBe(200);
    const arg = db.savedView.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: ID, orgId: "org" });
    expect(arg.data.name).toBe("Novo");
    expect(arg.data.config.estado.busca).toBe("b");
  });

  it("visão de outro contrato → 404 (a leitura é por orgId)", async () => {
    db.savedView.findFirst.mockResolvedValue(null);
    expect((await PATCH(req(`/api/visoes/${ID}`, { nome: "x" }, "PATCH"), params)).status).toBe(404);
    expect(db.savedView.findFirst.mock.calls.at(-1)![0].where).toEqual({ id: ID, orgId: "org" });
  });

  it("pessoal de outra pessoa → 404 (nem existe para mim)", async () => {
    db.savedView.findFirst.mockResolvedValue(linha({ ownerId: "u2" }));
    expect((await DELETE(req(`/api/visoes/${ID}`, undefined, "DELETE"), params)).status).toBe(404);
  });

  it("compartilhada de outra pessoa: vejo, mas não altero (403 → salvar como nova)", async () => {
    db.savedView.findFirst.mockResolvedValue(linha({ ownerId: "u2", visibility: "contrato" }));
    const res = await PATCH(req(`/api/visoes/${ID}`, { config: {} }, "PATCH"), params);
    expect(res.status).toBe(403);
    expect(db.savedView.updateMany).not.toHaveBeenCalled();
  });

  it("admin altera a compartilhada, mas não a deixa “Só eu”", async () => {
    sessao.atual = { orgId: "org", userId: "adm", role: "owner" };
    db.savedView.findFirst.mockResolvedValue(linha({ ownerId: "u2", visibility: "contrato" }));
    expect((await PATCH(req(`/api/visoes/${ID}`, { nome: "Ok" }, "PATCH"), params)).status).toBe(200);
    expect((await PATCH(req(`/api/visoes/${ID}`, { visibilidade: "pessoal" }, "PATCH"), params)).status).toBe(403);
  });

  it("apagar limpa quem tinha como padrão", async () => {
    expect((await DELETE(req(`/api/visoes/${ID}`, undefined, "DELETE"), params)).status).toBe(200);
    expect(db.savedView.deleteMany).toHaveBeenCalledWith({ where: { id: ID, orgId: "org" } });
    expect(db.savedViewDefault.deleteMany).toHaveBeenCalledWith({ where: { orgId: "org", viewKey: ID } });
  });
});

describe("PUT /api/visoes/padrao", () => {
  it("visão de sistema vale sem consultar", async () => {
    const res = await PUT(req("/api/visoes/padrao", { entidade: "negocios", visao: "atencao" }, "PUT"));
    expect((await res.json()).padrao).toBe("atencao");
    expect(db.savedViewDefault.upsert.mock.calls[0][0].create).toEqual({ orgId: "org", userId: "u1", entity: "negocios", viewKey: "atencao" });
  });

  it("salva que não enxergo → 404", async () => {
    db.savedView.findFirst.mockResolvedValue(linha({ ownerId: "u2" }));
    expect((await PUT(req("/api/visoes/padrao", { entidade: "contatos", visao: ID }, "PUT"))).status).toBe(404);
  });
});
