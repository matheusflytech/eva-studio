import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({
  profile: { findMany: vi.fn(), findFirst: vi.fn() },
  membership: { findMany: vi.fn() },
  organization: { findUnique: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { contratosDaPessoa, ehMembroDoContrato, ehSuperadmin, membrosDoContrato, whereMembrosDoContrato } from "./contratos";

const ausente = () => Object.assign(new Error('relation "eva_studio_memberships" does not exist'), { code: "P2021" });

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  delete process.env.EVA_SUPERADMINS;
});

describe("membros do contrato (responsável, atendente)", () => {
  it("vínculo com acesso ou contrato padrão sem vínculo; removido fica de fora", () => {
    expect(whereMembrosDoContrato("o1")).toEqual({
      OR: [
        { memberships: { some: { orgId: "o1", status: { in: ["ativo", "convidado"] } } } },
        { orgId: "o1", memberships: { none: { orgId: "o1" } } },
      ],
    });
  });

  it("antes do SQL, cai no Profile.orgId", async () => {
    db.profile.findFirst.mockRejectedValueOnce(ausente()).mockResolvedValueOnce({ id: "u1" });
    expect(await ehMembroDoContrato("o1", "u1")).toBe(true);
    expect(db.profile.findFirst.mock.calls[1][0]).toEqual({ where: { id: "u1", orgId: "o1" }, select: { id: true } });

    db.profile.findMany.mockRejectedValueOnce(ausente()).mockResolvedValueOnce([{ id: "u1" }]);
    expect(await membrosDoContrato("o1", { id: true })).toEqual([{ id: "u1" }]);
  });

  it("erro que não é de tabela ausente não é engolido", async () => {
    db.profile.findFirst.mockRejectedValueOnce(new Error("timeout"));
    await expect(ehMembroDoContrato("o1", "u1")).rejects.toThrow("timeout");
  });
});

describe("contratos da pessoa", () => {
  it("vínculos com acesso + contrato padrão sem vínculo, por nome", async () => {
    db.membership.findMany.mockResolvedValue([
      { orgId: "b", status: "ativo", organization: { id: "b", name: "Beta", logoUrl: null } },
      { orgId: "c", status: "removido", organization: { id: "c", name: "Cancelado", logoUrl: null } },
    ]);
    db.organization.findUnique.mockResolvedValue({ id: "a", name: "Alfa", logoUrl: null });
    expect((await contratosDaPessoa({ id: "u1", profileOrgId: "a" })).map((c) => c.name)).toEqual(["Alfa", "Beta"]);
  });
});

describe("superadmin", () => {
  it("por e-mail ou id, sem diferenciar maiúsculas; lista vazia = ninguém", () => {
    expect(ehSuperadmin({ id: "u1", email: "a@eva.app" })).toBe(false);
    process.env.EVA_SUPERADMINS = " A@Eva.app ,uuid-2";
    expect(ehSuperadmin({ id: "u1", email: "a@eva.app" })).toBe(true);
    expect(ehSuperadmin({ id: "UUID-2" })).toBe(true);
    expect(ehSuperadmin({ id: "u3", email: "b@eva.app" })).toBe(false);
  });
});
