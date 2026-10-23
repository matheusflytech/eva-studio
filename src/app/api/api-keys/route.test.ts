import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({ apiKey: { findMany: vi.fn(), create: vi.fn() } }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
const auth = vi.hoisted(() => ({ requirePermission: vi.fn(), ctxPode: vi.fn(() => true) }));
vi.mock("@/lib/server/permissions", () => auth);
const hist = vi.hoisted(() => ({ registrarHistorico: vi.fn() }));
vi.mock("@/lib/server/historico", () => hist);

import { POST, GET } from "./route";
import { permissoesDoPapelDeSistema } from "@/lib/permissoes/catalogo";
import { autenticarChave } from "@/lib/server/api-keys";

const post = (body: unknown) => POST(new Request("http://x/api/api-keys", { method: "POST", body: JSON.stringify(body) }));

beforeEach(() => {
  vi.clearAllMocks();
  db.apiKey.create.mockImplementation(async ({ data }: { data: { name: string } }) => ({ id: "k1", name: data.name, keyPrefix: "evs_live_x", createdAt: new Date() }));
});

describe("chaves de API por contrato", () => {
  it("cria no contrato ativo, com responsável e validade", async () => {
    auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner", permissoes: permissoesDoPapelDeSistema("owner") });
    const quando = new Date(Date.now() + 86_400_000).toISOString();
    const res = await post({ name: "n8n", scopes: ["deals:read"], expiresAt: quando });
    expect(res.status).toBe(200);
    expect(auth.requirePermission).toHaveBeenCalledWith("api:gerenciar");
    expect(db.apiKey.create.mock.calls[0][0].data).toMatchObject({ orgId: "o1", name: "n8n", scopes: ["deals:read"], createdById: "u1" });
    expect(db.apiKey.create.mock.calls[0][0].data.expiresAt.toISOString()).toBe(quando);
    // Auditoria: nome e começo da chave, nunca a chave nem o hash.
    const linha = hist.registrarHistorico.mock.calls[0][0];
    expect(linha).toMatchObject({ orgId: "o1", acao: "chave_api.criou", objeto: "api_key", objetoId: "k1", objetoNome: "n8n", detalhes: { prefixo: "evs_live_x", escopos: ["deals:read"] } });
    const { apiKey } = await res.json();
    expect(JSON.stringify(linha)).not.toContain(apiKey.key);
    expect(JSON.stringify(linha)).not.toContain(db.apiKey.create.mock.calls[0][0].data.keyHash);
  });

  it("a chave não pode mais do que quem cria", async () => {
    auth.requirePermission.mockResolvedValue({
      userId: "u1",
      orgId: "o1",
      role: "agent",
      permissoes: ["api:gerenciar", "negocios:ver"],
    });
    const res = await post({ name: "x", scopes: ["deals:write"] });
    expect(res.status).toBe(403);
    expect(db.apiKey.create).not.toHaveBeenCalled();
    expect((await post({ name: "x", scopes: ["*"] })).status).toBe(403);
    expect((await post({ name: "x", scopes: ["deals:read"] })).status).toBe(200);
  });

  it("validade no passado é recusada", async () => {
    auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner", permissoes: permissoesDoPapelDeSistema("owner") });
    expect((await post({ name: "x", expiresAt: "2020-01-01" })).status).toBe(400);
  });

  it("antes do SQL de contratos, cria sem responsável/validade", async () => {
    auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "owner", permissoes: permissoesDoPapelDeSistema("owner") });
    db.apiKey.create.mockRejectedValueOnce(Object.assign(new Error("column does not exist"), { code: "P2022" }));
    const res = await post({ name: "x" });
    expect(res.status).toBe(200);
    expect(db.apiKey.create.mock.calls[1][0].data).not.toHaveProperty("createdById");
  });

  it("lista só as do contrato ativo", async () => {
    auth.requirePermission.mockResolvedValue({ userId: "u1", orgId: "o1", role: "viewer" });
    db.apiKey.findMany.mockResolvedValue([]);
    await GET();
    expect(db.apiKey.findMany.mock.calls[0][0].where).toEqual({ orgId: "o1" });
  });
});

describe("chave vencida", () => {
  it("vencida = 401 na API v1 (autenticação devolve null)", async () => {
    const dbKeys = db as unknown as { apiKey: { findFirst: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> } };
    dbKeys.apiKey.findFirst = vi.fn(async () => ({ id: "k", orgId: "o1", scopes: ["*"], expiresAt: new Date(Date.now() - 1000) }));
    dbKeys.apiKey.update = vi.fn(async () => ({}));
    const req = new Request("http://x", { headers: { authorization: "Bearer evs_live_abc" } });
    expect(await autenticarChave(req)).toBeNull();
    dbKeys.apiKey.findFirst = vi.fn(async () => ({ id: "k", orgId: "o1", scopes: ["*"], expiresAt: null }));
    expect(await autenticarChave(req)).toMatchObject({ orgId: "o1" });
  });
});
