import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";

const db = vi.hoisted(() => ({
  profile: { findUnique: vi.fn() },
  membership: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(async () => ({})) },
  permissionGroup: { findMany: vi.fn(async () => []) },
  organization: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

const req = vi.hoisted(() => ({
  user: { id: "u1", email: "ana@cliente.com" } as { id: string; email: string } | null,
  headers: new Map<string, string>(),
  cookies: new Map<string, string>(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: req.user } }) } }),
}));
// Mesmo objeto durante a "requisição", como o Next (a pessoa logada é marcada nele).
const cabecalhos = { get: (k: string) => req.headers.get(k) ?? null };
vi.mock("next/headers", () => ({
  headers: async () => cabecalhos,
  cookies: async () => ({ get: (k: string) => (req.cookies.has(k) ? { value: req.cookies.get(k) } : undefined) }),
}));

import { getSessionContext, requirePermission } from "./permissions";
import { atorDaRequisicao } from "./eventos/ator-da-requisicao";

type Vinculo = { id: string; orgId: string; userId: string; role: string; roleId: string | null; groupIds: string[]; status: string; customRole: unknown };
let vinculos: Vinculo[];

function vinculo(orgId: string, role: string, extra: Partial<Vinculo> = {}): Vinculo {
  return { id: `m-${orgId}`, orgId, userId: "u1", role, roleId: null, groupIds: [], status: "ativo", customRole: null, ...extra };
}

beforeEach(() => {
  vi.clearAllMocks();
  req.user = { id: "u1", email: "ana@cliente.com" };
  req.headers = new Map();
  req.cookies = new Map();
  delete process.env.EVA_SUPERADMINS;
  db.profile.findUnique.mockResolvedValue({ orgId: A, role: "owner" });
  vinculos = [vinculo(A, "owner"), vinculo(B, "viewer")];
  db.membership.findUnique.mockImplementation(async ({ where }: { where: { orgId_userId: { orgId: string } } }) =>
    vinculos.find((v) => v.orgId === where.orgId_userId.orgId) ?? null
  );
  db.membership.findFirst.mockImplementation(async () => {
    const v = vinculos.find((x) => x.status !== "removido");
    return v ? { orgId: v.orgId } : null;
  });
  db.organization.findUnique.mockResolvedValue(null);
});

afterEach(() => {
  delete process.env.EVA_SUPERADMINS;
});

describe("pessoa da requisição (histórico)", () => {
  it("depois de requirePermission, o que a requisição mudar sai com a pessoa", async () => {
    const ctx = await requirePermission("read");
    expect(ctx).toMatchObject({ userId: "u1" });
    expect(await atorDaRequisicao()).toEqual({ tipo: "usuario", id: "u1" });
  });
});

describe("contrato ativo", () => {
  it("cabeçalho escolhe o contrato e o papel daquele contrato", async () => {
    req.headers.set("x-eva-contrato", B);
    const ctx = await getSessionContext();
    expect(ctx?.orgId).toBe(B);
    expect(ctx?.role).toBe("viewer");
  });

  it("duas requisições com contratos diferentes não se misturam", async () => {
    req.headers.set("x-eva-contrato", A);
    const a = await getSessionContext();
    req.headers.set("x-eva-contrato", B);
    const b = await getSessionContext();
    expect([a?.orgId, a?.role]).toEqual([A, "owner"]);
    expect([b?.orgId, b?.role]).toEqual([B, "viewer"]);
  });

  it("contrato sem vínculo no cabeçalho = 403, sem cair em outro contrato", async () => {
    req.headers.set("x-eva-contrato", C);
    const r = await requirePermission("read");
    expect(r).toEqual({ error: "Você não tem acesso a este contrato.", status: 403 });
    // Não consulta o contrato pedido (nem para dizer se existe).
    expect(db.organization.findUnique).not.toHaveBeenCalled();
  });

  it("lixo no cabeçalho também é 403", async () => {
    req.headers.set("x-eva-contrato", "' OR 1=1 --");
    expect(await requirePermission("read")).toMatchObject({ status: 403 });
  });

  it("sem cabeçalho usa o último contrato (cookie) se ainda tiver acesso", async () => {
    req.cookies.set("eva_contrato", B);
    expect((await getSessionContext())?.orgId).toBe(B);
  });

  it("cookie de contrato sem acesso é ignorado: cai no padrão", async () => {
    req.cookies.set("eva_contrato", C);
    expect((await getSessionContext())?.orgId).toBe(A);
  });

  it("removido do contrato padrão não entra pelo legado", async () => {
    vinculos = [vinculo(A, "owner", { status: "removido" }), vinculo(B, "agent")];
    req.headers.set("x-eva-contrato", A);
    expect(await requirePermission("read")).toMatchObject({ status: 403 });
    req.headers.delete("x-eva-contrato");
    expect((await getSessionContext())?.orgId).toBe(B);
  });

  it("antes do SQL (tabela ausente) funciona como sempre, só com Profile.orgId", async () => {
    db.membership.findUnique.mockRejectedValue(Object.assign(new Error("relation does not exist"), { code: "P2021" }));
    db.membership.findFirst.mockRejectedValue(Object.assign(new Error("relation does not exist"), { code: "P2021" }));
    const ctx = await getSessionContext();
    expect([ctx?.orgId, ctx?.role]).toEqual([A, "owner"]);
    req.headers.set("x-eva-contrato", B);
    expect(await requirePermission("read")).toMatchObject({ status: 403 });
  });

  it("sem login = 401", async () => {
    req.user = null;
    expect(await requirePermission("read")).toEqual({ error: "Não autenticado.", status: 401 });
  });

  it("convidado entra e vira ativo", async () => {
    vinculos = [vinculo(A, "owner"), vinculo(B, "agent", { status: "convidado" })];
    req.headers.set("x-eva-contrato", B);
    expect((await getSessionContext())?.orgId).toBe(B);
    expect(db.membership.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "ativo" } }));
  });
});

describe("superadmin", () => {
  it("entra em contrato que existe sem vínculo, como dono", async () => {
    process.env.EVA_SUPERADMINS = "equipe@eva.app, ANA@cliente.com";
    db.organization.findUnique.mockResolvedValue({ id: C });
    req.headers.set("x-eva-contrato", C);
    const ctx = await getSessionContext();
    expect(ctx).toMatchObject({ orgId: C, role: "owner", superadmin: true });
  });

  it("contrato inexistente continua 403 até para superadmin", async () => {
    process.env.EVA_SUPERADMINS = "ana@cliente.com";
    req.headers.set("x-eva-contrato", C);
    expect(await requirePermission("read")).toMatchObject({ status: 403 });
  });
});

describe("permissões no contrato", () => {
  it("papéis de sistema seguem respondendo às permissões antigas", async () => {
    req.headers.set("x-eva-contrato", B); // viewer
    expect(await requirePermission("read")).toMatchObject({ orgId: B });
    expect(await requirePermission("contacts:manage")).toMatchObject({ status: 403 });
    expect(await requirePermission("negocios:ver")).toMatchObject({ orgId: B });
  });

  it("papel personalizado + grupo somam permissões; escopo vem do papel", async () => {
    vinculos = [
      vinculo(A, "owner"),
      vinculo(B, "agent", {
        roleId: "r1",
        groupIds: ["g1"],
        customRole: { id: "r1", orgId: B, permissions: ["negocios:ver"], groupIds: [], dataScope: { negocios: "proprios" } },
      }),
    ];
    db.permissionGroup.findMany.mockResolvedValue([{ permissions: ["negocios:exportar"] }] as never);
    req.headers.set("x-eva-contrato", B);
    const ctx = await getSessionContext();
    expect(ctx?.permissoes).toEqual(["negocios:exportar", "negocios:ver"]);
    expect(ctx?.escopo).toEqual({ negocios: "proprios", contatos: "todos", conversas: "todos" });
    expect(await requirePermission("negocios:exportar")).toMatchObject({ orgId: B });
    expect(await requirePermission("negocios:editar")).toMatchObject({ status: 403 });
    expect(await requirePermission("conversations:reply")).toMatchObject({ status: 403 });
  });

  it("papel personalizado de outro contrato não vale aqui", async () => {
    vinculos = [
      vinculo(A, "owner"),
      vinculo(B, "viewer", { roleId: "r1", customRole: { id: "r1", orgId: C, permissions: ["membros:gerenciar"], groupIds: [], dataScope: {} } }),
    ];
    req.headers.set("x-eva-contrato", B);
    expect(await requirePermission("membros:gerenciar")).toMatchObject({ status: 403 });
  });
});
