import { describe, it, expect, vi, beforeEach } from "vitest";

const A = "11111111-1111-4111-8111-111111111111";

const db = vi.hoisted(() => ({
  profile: { findUnique: vi.fn() },
  organization: { findUnique: vi.fn() },
  customRole: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1", email: "a@x.com" } } }) } }),
}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
const perm = vi.hoisted(() => ({ getSessionContextDetalhado: vi.fn(), requirePermission: vi.fn() }));
vi.mock("@/lib/server/permissions", () => perm);
const contratos = vi.hoisted(() => ({
  contratosDaPessoa: vi.fn(async () => [{ id: A, name: "Meu contrato", logoUrl: null }]),
  ehSuperadmin: vi.fn(() => false),
  resolverContratoAtivo: vi.fn(async () => ({ ok: true, acesso: { orgId: A } })),
}));
vi.mock("@/lib/server/contratos", () => contratos);

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  db.profile.findUnique.mockResolvedValue({ id: "u1", name: "Ana", email: "a@x.com", orgId: A, role: "owner" });
  db.organization.findUnique.mockResolvedValue({ id: A, name: "Meu contrato", logoUrl: null });
});

describe("GET /api/me", () => {
  it("contrato com acesso: sessão daquele contrato e cookie de último usado", async () => {
    perm.getSessionContextDetalhado.mockResolvedValue({ ctx: { userId: "u1", orgId: A, role: "admin", permissoes: ["negocios:ver"] } });
    const res = await GET();
    const { session } = await res.json();
    expect(session).toMatchObject({ contratoId: A, orgName: "Meu contrato", papel: "admin", papelNome: "Administrador" });
    expect(res.headers.get("set-cookie")).toContain(`eva_contrato=${A}`);
  });

  it("contrato sem vínculo: só a pessoa, sem nada do contrato pedido, e o padrão para onde ir", async () => {
    perm.getSessionContextDetalhado.mockResolvedValue({ ctx: null, falha: "sem_acesso" });
    const res = await GET();
    const { session } = await res.json();
    expect(session).toMatchObject({ semAcesso: true, orgName: "", contratoPadrao: A, name: "Ana" });
    expect(session.contratoId).toBeUndefined();
    expect(session.permissoes).toBeUndefined();
    // Não consulta o contrato pedido (nem o nome).
    expect(db.organization.findUnique).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });
});
