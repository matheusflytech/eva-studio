import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  product: { findMany: vi.fn(), count: vi.fn(), create: vi.fn() },
}));
const perm = vi.hoisted(() => ({
  requirePermission: vi.fn<(p: string) => Promise<unknown>>(async () => ({ orgId: "org", userId: "u", role: "owner" })),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/permissions", () => perm);

import { GET, POST } from "./route";

const post = (body: unknown) =>
  POST(new Request("http://x/api/products", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) }));

const PRODUTO = {
  id: "p1",
  name: "Plano Pro",
  sku: "PRO",
  description: "",
  priceCents: 9_900,
  currency: "BRL",
  unit: "mês",
  recurrence: "mensal",
  category: "",
  archivedAt: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  db.product.findMany.mockResolvedValue([PRODUTO]);
  db.product.count.mockResolvedValue(0);
  db.product.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...PRODUTO, ...data, id: "novo" }));
});

describe("GET /api/products", () => {
  it("só da organização da sessão e só ativos por padrão", async () => {
    const res = await GET(new Request("http://x/api/products"));
    expect(res.status).toBe(200);
    const where = db.product.findMany.mock.calls[0][0].where;
    expect(where.orgId).toBe("org");
    expect(where.archivedAt).toBeNull();
    expect((await res.json()).produtos[0].name).toBe("Plano Pro");
  });

  it("busca procura em nome, código e categoria", async () => {
    await GET(new Request("http://x/api/products?busca=pro"));
    const where = db.product.findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(3);
    expect(where.OR[0]).toEqual({ name: { contains: "pro", mode: "insensitive" } });
  });

  it("?arquivados=1 inclui arquivados", async () => {
    await GET(new Request("http://x/api/products?arquivados=1"));
    expect(db.product.findMany.mock.calls[0][0].where.archivedAt).toBeUndefined();
  });

  it("tabela ainda não existe: lista vazia com disponivel=false", async () => {
    db.product.findMany.mockRejectedValue(new Error('relation "eva_studio_products" does not exist'));
    const res = await GET(new Request("http://x/api/products"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ produtos: [], disponivel: false });
  });
});

describe("POST /api/products", () => {
  it("exige agents:manage", async () => {
    perm.requirePermission.mockResolvedValueOnce({ error: "Seu perfil não tem permissão para essa ação.", status: 403 });
    const res = await post({ name: "X" });
    expect(res.status).toBe(403);
    expect(perm.requirePermission).toHaveBeenCalledWith("produtos:gerenciar");
    expect(db.product.create).not.toHaveBeenCalled();
  });

  it("JSON inválido → 400", async () => {
    expect((await post("nao-json")).status).toBe(400);
  });

  it("nome obrigatório", async () => {
    const res = await post({ name: "  " });
    expect(res.status).toBe(400);
    expect(db.product.create).not.toHaveBeenCalled();
  });

  it("preço inválido → 400", async () => {
    expect((await post({ name: "X", price: "abc" })).status).toBe(400);
    expect((await post({ name: "X", price: -5 })).status).toBe(400);
  });

  it("recorrência inválida → 400", async () => {
    expect((await post({ name: "X", recurrence: "semanal" })).status).toBe(400);
  });

  it("cria na org da sessão, preço em centavos", async () => {
    const res = await post({ name: "Plano Pro", price: "99,90", recurrence: "mensal", unit: "mês", sku: " PRO " });
    expect(res.status).toBe(200);
    const data = db.product.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ orgId: "org", name: "Plano Pro", priceCents: 9_990, recurrence: "mensal", unit: "mês", sku: "PRO" });
  });

  it("limite de produtos por organização", async () => {
    db.product.count.mockResolvedValue(2_000);
    const res = await post({ name: "Mais um" });
    expect(res.status).toBe(400);
    expect(db.product.create).not.toHaveBeenCalled();
  });

  it("tabela ainda não existe: 503", async () => {
    db.product.count.mockRejectedValue(new Error('relation "eva_studio_products" does not exist'));
    expect((await post({ name: "X" })).status).toBe(503);
  });
});
