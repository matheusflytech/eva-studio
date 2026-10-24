import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  membership: { findMany: vi.fn(), upsert: vi.fn(async () => ({})), update: vi.fn(async () => ({})), create: vi.fn() },
  profile: { findMany: vi.fn(), findFirst: vi.fn(), updateMany: vi.fn(async () => ({})), create: vi.fn() },
  teamMember: { findMany: vi.fn(async () => []), deleteMany: vi.fn(async () => ({})), upsert: vi.fn() },
  customRole: { findFirst: vi.fn(), findMany: vi.fn(async () => []) },
  permissionGroup: { findMany: vi.fn(async (): Promise<unknown[]> => []) },
  team: { findMany: vi.fn(async () => []) },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
const admin = vi.hoisted(() => ({ inviteUserByEmail: vi.fn(), deleteUser: vi.fn(async () => ({})) }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ auth: { admin } }) }));
const hist = vi.hoisted(() => ({ registrarHistorico: vi.fn() }));
vi.mock("@/lib/server/historico", () => hist);
const convite = vi.hoisted(() => ({ enviarLinkDoConvite: vi.fn(async () => null as string | null) }));
vi.mock("@/lib/server/convite", () => convite);

import { alterarMembro, convidarMembro, listarMembros, removerMembro } from "./membros";

const dono = { userId: "u-dono", orgId: "o1", role: "owner" as const };
const gerente = { userId: "u-ger", orgId: "o1", role: "admin" as const, permissoes: ["membros:gerenciar" as const] };

function vinculo(userId: string, role: string, status = "ativo") {
  return { userId, role, roleId: null, groupIds: [], status, createdAt: new Date(), user: { name: userId, email: `${userId}@x.com` } };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.membership.findMany.mockResolvedValue([vinculo("u-dono", "owner"), vinculo("u-ger", "admin"), vinculo("u-ana", "agent")]);
  db.profile.findMany.mockResolvedValue([]);
});

describe("membros do contrato", () => {
  it("lista vínculos + perfis legados (sem vínculo, contrato padrão)", async () => {
    db.profile.findMany.mockResolvedValue([{ id: "u-velho", name: "Velho", email: "v@x.com", role: "bogus", createdAt: new Date() }]);
    const m = await listarMembros("o1");
    expect(m.map((x) => [x.id, x.role])).toEqual([
      ["u-velho", "owner"],
      ["u-dono", "owner"],
      ["u-ger", "admin"],
      ["u-ana", "agent"],
    ]);
  });

  it("antes do SQL, lista só por Profile.orgId", async () => {
    db.membership.findMany.mockRejectedValue(Object.assign(new Error("x"), { code: "P2021" }));
    db.profile.findMany.mockResolvedValue([{ id: "u1", name: "A", email: "a@x", role: "admin", createdAt: new Date() }]);
    expect((await listarMembros("o1")).map((m) => m.id)).toEqual(["u1"]);
  });

  it("ninguém mexe no próprio acesso (nem papel, nem grupo)", async () => {
    await expect(alterarMembro(gerente, { userId: "u-ger", role: "owner" })).rejects.toThrow("próprio acesso");
    await expect(alterarMembro(gerente, { userId: "u-ger", groupIds: ["g1"] })).rejects.toThrow("próprio acesso");
  });

  it("quem não é dono não cria dono nem mexe em dono", async () => {
    await expect(alterarMembro(gerente, { userId: "u-ana", role: "owner" })).rejects.toMatchObject({ status: 403 });
    await expect(alterarMembro(gerente, { userId: "u-dono", role: "viewer" })).rejects.toMatchObject({ status: 403 });
  });

  it("o contrato não fica sem dono", async () => {
    db.membership.findMany.mockResolvedValue([vinculo("u-dono", "owner"), vinculo("u-ana", "owner")]);
    await alterarMembro(dono, { userId: "u-ana", role: "agent" });
    db.membership.findMany.mockResolvedValue([vinculo("u-dono", "owner"), vinculo("u-ana", "agent")]);
    await expect(removerMembro({ ...dono, userId: "u-ana" }, "u-dono")).rejects.toThrow("pelo menos um dono");
  });

  it("papel personalizado de outro contrato é recusado", async () => {
    db.customRole.findFirst.mockResolvedValue(null);
    await expect(alterarMembro(dono, { userId: "u-ana", roleId: "r-de-outro" })).rejects.toMatchObject({ status: 404 });
    expect(db.customRole.findFirst).toHaveBeenCalledWith({ where: { id: "r-de-outro", orgId: "o1" }, select: { id: true } });
  });

  it("mudar papel atualiza o vínculo e o Profile.role do contrato padrão", async () => {
    await alterarMembro(dono, { userId: "u-ana", role: "viewer" });
    expect(db.membership.update).toHaveBeenCalledWith({
      where: { orgId_userId: { orgId: "o1", userId: "u-ana" } },
      data: { role: "viewer" },
    });
    expect(db.profile.updateMany).toHaveBeenCalledWith({ where: { id: "u-ana", orgId: "o1" }, data: { role: "viewer" } });
    expect(hist.registrarHistorico).toHaveBeenCalledWith({
      orgId: "o1",
      acao: "membro.mudou_acesso",
      objeto: "member",
      objetoId: "u-ana",
      objetoNome: "u-ana",
      mudancas: { papel: { de: "Atendente", para: "Somente leitura" } },
      detalhes: { email: "u-ana@x.com" },
    });
  });

  it("grupos no histórico pelos nomes; sem mudança de fato, nada grava", async () => {
    db.permissionGroup.findMany.mockResolvedValue([{ id: "g1", name: "Financeiro" }]);
    await alterarMembro(dono, { userId: "u-ana", groupIds: ["g1"] });
    expect(hist.registrarHistorico.mock.calls[0][0].mudancas).toEqual({ grupos: { de: [], para: ["Financeiro"] } });
    hist.registrarHistorico.mockClear();
    await alterarMembro(dono, { userId: "u-ana", role: "agent" });
    expect(hist.registrarHistorico).not.toHaveBeenCalled();
  });

  it("remover marca 'removido' (não apaga) e tira das equipes do contrato", async () => {
    await removerMembro(dono, "u-ana");
    expect(db.membership.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: { status: "removido" } }));
    expect(db.teamMember.deleteMany).toHaveBeenCalledWith({ where: { userId: "u-ana", team: { orgId: "o1" } } });
    expect(hist.registrarHistorico).toHaveBeenCalledWith(expect.objectContaining({ acao: "membro.removeu", objetoId: "u-ana" }));
  });
});

describe("convite", () => {
  it("conta existente fica pendente e recebe o link de aceite", async () => {
    db.profile.findFirst.mockResolvedValue({ id: "u-bia", orgId: "o2" });
    const r = await convidarMembro(dono, { email: "Bia@X.com", role: "agent" }, "https://app");
    expect(r).toEqual({ userId: "u-bia", email: "bia@x.com", novo: false });
    expect(db.membership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ orgId: "o1", userId: "u-bia", status: "pendente" }) })
    );
    expect(convite.enviarLinkDoConvite).toHaveBeenCalledWith("bia@x.com", "o1", "u-bia", "https://app");
    expect(admin.inviteUserByEmail).not.toHaveBeenCalled();
    expect(hist.registrarHistorico).toHaveBeenCalledWith({
      orgId: "o1",
      acao: "membro.convidou",
      objeto: "member",
      objetoId: "u-bia",
      objetoNome: "bia",
      detalhes: { email: "bia@x.com", papel: "Atendente" },
    });
  });

  it("quem já participa não é convidado de novo", async () => {
    db.profile.findFirst.mockResolvedValue({ id: "u-ana", orgId: "o1" });
    await expect(convidarMembro(dono, { email: "ana@x.com" }, "https://app")).rejects.toMatchObject({ status: 409 });
  });

  it("conta nova: convite do Supabase + perfil com este contrato como padrão", async () => {
    db.profile.findFirst.mockResolvedValue(null);
    admin.inviteUserByEmail.mockResolvedValue({ data: { user: { id: "u-novo" } }, error: null });
    const r = await convidarMembro(dono, { email: "novo@x.com", role: "viewer" }, "https://app");
    expect(r.novo).toBe(true);
    expect(admin.inviteUserByEmail).toHaveBeenCalledWith("novo@x.com", { redirectTo: "https://app/login" });
    expect(db.profile.create).toHaveBeenCalledWith({ data: { id: "u-novo", orgId: "o1", name: "novo", email: "novo@x.com", role: "viewer" } });
  });

  it("só dono convida dono", async () => {
    await expect(convidarMembro(gerente, { email: "x@x.com", role: "owner" }, "https://app")).rejects.toMatchObject({ status: 403 });
  });
});
