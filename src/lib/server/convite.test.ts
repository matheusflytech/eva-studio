import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const db = vi.hoisted(() => ({ membership: { findUnique: vi.fn(), updateMany: vi.fn() } }));
const admin = vi.hoisted(() => ({ auth: { admin: { updateUserById: vi.fn(), signOut: vi.fn() } } }));
const publico = vi.hoisted(() => ({ auth: { signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn() } }));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => admin }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => publico }));

import { aceitarConvite, criarTokenDeConvite, lerTokenDeConvite } from "./convite";

const original = process.env.INTERNAL_API_SECRET;
beforeEach(() => {
  process.env.INTERNAL_API_SECRET = "segredo-teste";
  vi.clearAllMocks();
  db.membership.findUnique.mockResolvedValue({ id: "m1", status: "pendente" });
  admin.auth.admin.updateUserById.mockResolvedValue({ data: { user: { email: "ceo@cliente.com" } }, error: null });
  publico.auth.signInWithPassword.mockResolvedValue({ data: { session: { access_token: "jwt" } }, error: null });
  admin.auth.admin.signOut.mockResolvedValue({ error: null });
});
afterEach(() => {
  process.env.INTERNAL_API_SECRET = original;
});

describe("token do convite", () => {
  it("volta o contrato e a pessoa, e recusa token alterado ou vencido", () => {
    const t = criarTokenDeConvite("org1", "u1", 1_000);
    expect(lerTokenDeConvite(t, 2_000)).toEqual({ orgId: "org1", userId: "u1" });
    const [carga, assinatura] = t.split(".");
    const outraPessoa = Buffer.from("org1\nu2\n999999999999999").toString("base64url");
    expect(lerTokenDeConvite(`${outraPessoa}.${assinatura}`, 2_000)).toBeNull();
    expect(lerTokenDeConvite(`${carga}.x${assinatura}`, 2_000)).toBeNull();
    expect(lerTokenDeConvite(t, 1_000 + 8 * 24 * 60 * 60 * 1000)).toBeNull();
  });
});

describe("aceitarConvite", () => {
  it("troca a senha, derruba todas as sessões e só então libera o acesso", async () => {
    await aceitarConvite(criarTokenDeConvite("org1", "u1"), "senha-nova-123");
    expect(admin.auth.admin.updateUserById).toHaveBeenCalledWith("u1", { password: "senha-nova-123" });
    expect(admin.auth.admin.signOut).toHaveBeenCalledWith("jwt", "global");
    expect(db.membership.updateMany).toHaveBeenCalledWith({ where: { id: "m1", status: "pendente" }, data: { status: "convidado" } });
  });

  it("não libera o acesso se não conseguir derrubar as outras sessões", async () => {
    admin.auth.admin.signOut.mockResolvedValue({ error: { message: "falhou" } });
    await expect(aceitarConvite(criarTokenDeConvite("org1", "u1"), "senha-nova-123")).rejects.toThrow(/sessões/);
    expect(db.membership.updateMany).not.toHaveBeenCalled();
  });

  it("convite que já não está pendente (removido ou aceito) não mexe na senha", async () => {
    db.membership.findUnique.mockResolvedValue({ id: "m1", status: "removido" });
    await expect(aceitarConvite(criarTokenDeConvite("org1", "u1"), "senha-nova-123")).rejects.toMatchObject({ status: 410 });
    expect(admin.auth.admin.updateUserById).not.toHaveBeenCalled();
  });
});
