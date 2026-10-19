import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  profile: { findUnique: vi.fn() },
  organization: { count: vi.fn(), findMany: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1", email: "a@x.com" } } }) } }),
}));
const cookie = vi.hoisted(() => ({ valor: undefined as string | undefined }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => (cookie.valor ? { value: cookie.valor } : undefined) }) }));
const contratos = vi.hoisted(() => ({ contratosDaPessoa: vi.fn(), ehSuperadmin: vi.fn(() => false) }));
vi.mock("@/lib/server/contratos", () => contratos);

import { GET } from "./route";

const C = (id: string, name: string) => ({ id, name, logoUrl: null });
const get = (q = "") => GET(new Request(`http://x/api/contratos${q}`)).then((r) => r.json());

beforeEach(() => {
  vi.clearAllMocks();
  cookie.valor = undefined;
  db.profile.findUnique.mockResolvedValue({ orgId: "a", name: "Ana" });
  contratos.contratosDaPessoa.mockResolvedValue([C("aaaa1111", "Alfa"), C("bbbb2222", "Beta"), C("cccc3333", "Gama")]);
});

describe("GET /api/contratos", () => {
  it("lista os contratos da pessoa com o último usado no topo", async () => {
    cookie.valor = "cccc3333";
    const d = await get();
    expect(d.contratos.map((c: { name: string }) => c.name)).toEqual(["Gama", "Alfa", "Beta"]);
    expect(d).toMatchObject({ nome: "Ana", superadmin: false, total: 3, totalSemBusca: 3 });
  });

  it("busca por nome ou começo do id", async () => {
    expect((await get("?busca=bet")).contratos.map((c: { id: string }) => c.id)).toEqual(["bbbb2222"]);
    expect((await get("?busca=cccc")).contratos.map((c: { id: string }) => c.id)).toEqual(["cccc3333"]);
  });

  it("superadmin busca em todos os contratos, paginado, sem repetir o último usado", async () => {
    contratos.ehSuperadmin.mockReturnValue(true);
    cookie.valor = "zz";
    db.organization.count.mockResolvedValue(300);
    db.organization.findMany.mockResolvedValue([C("x1", "X")]);
    db.organization.findFirst.mockResolvedValue(C("zz", "Último"));
    const d = await get("?pagina=1");
    expect(d.superadmin).toBe(true);
    expect(d.contratos.map((c: { id: string }) => c.id)).toEqual(["zz", "x1"]);
    expect(db.organization.findMany.mock.calls[0][0]).toMatchObject({ skip: 0, take: 50, where: { AND: [{}, { id: { not: "zz" } }] } });
  });
});
