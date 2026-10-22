import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({
  profile: { findMany: vi.fn(), findFirst: vi.fn() },
  membership: { findMany: vi.fn(), findUnique: vi.fn() },
  organization: { findUnique: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import {
  contratosDaPessoa,
  ehMembroDoContrato,
  ehSuperadmin,
  expandirIdDoContrato,
  membrosDoContrato,
  resolverContratoAtivo,
  whereMembrosDoContrato,
} from "./contratos";

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

describe("id curto do contrato na URL", () => {
  const COMPLETO = "8d8d3a8c-2ff6-485e-a325-17384e9990cf";
  const pessoa = { id: "u1", profileOrgId: "outro", profileRole: "viewer" };

  it("curto vira o completo; completo e outra coisa voltam iguais", async () => {
    db.organization.findMany.mockResolvedValue([{ id: COMPLETO }]);
    expect(await expandirIdDoContrato("8D8D3A8C")).toBe(COMPLETO);
    expect(db.organization.findMany.mock.calls[0][0].where).toEqual({ id: { startsWith: "8d8d3a8c" } });
    expect(await expandirIdDoContrato(COMPLETO)).toBe(COMPLETO);
    expect(await expandirIdDoContrato("x")).toBe("x");
  });

  it("dois contratos com o mesmo começo: não escolhe nenhum", async () => {
    db.organization.findMany.mockResolvedValue([{ id: COMPLETO }, { id: "8d8d3a8c-0000-4000-8000-000000000000" }]);
    expect(await expandirIdDoContrato("8d8d3a8c")).toBeNull();
    expect(await resolverContratoAtivo(pessoa, "8d8d3a8c", null)).toEqual({ ok: false, motivo: "sem_acesso" });
    expect(db.membership.findUnique).not.toHaveBeenCalled();
  });

  it("pedido curto confere o vínculo no id completo", async () => {
    db.organization.findMany.mockResolvedValue([{ id: COMPLETO }]);
    db.membership.findUnique.mockResolvedValue({ id: "m1", role: "owner", status: "ativo", roleId: null, customRole: null, groupIds: [] });
    const r = await resolverContratoAtivo(pessoa, "8d8d3a8c", null);
    expect(r.ok && r.acesso.orgId).toBe(COMPLETO);
    expect(db.membership.findUnique.mock.calls[0][0].where).toEqual({ orgId_userId: { orgId: COMPLETO, userId: "u1" } });
  });

  it("curto que não existe: sem acesso, nunca cai em outro contrato", async () => {
    db.organization.findMany.mockResolvedValue([]);
    expect(await resolverContratoAtivo(pessoa, "deadbeef", "8d8d3a8c-2ff6-485e-a325-17384e9990cf")).toEqual({ ok: false, motivo: "sem_acesso" });
  });
});
