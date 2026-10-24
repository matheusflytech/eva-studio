import "server-only";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { prisma } from "@/lib/db/prisma";
import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Convite para quem JÁ tem conta. O cadastro é aberto e não confirma e-mail,
// então qualquer um pode ter criado a conta com o endereço de outra pessoa.
// Por isso o vínculo nasce "pendente" (sem acesso) e só vale quando alguém
// abre o link que foi para aquele e-mail e define uma senha nova: a senha de
// quem criou a conta deixa de valer e todas as sessões dela caem.
// ---------------------------------------------------------------------------

const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

const segredo = () => process.env.INTERNAL_API_SECRET ?? "";
const assinar = (carga: string) => crypto.createHmac("sha256", segredo()).update(`convite:${carga}`).digest("base64url");

export function criarTokenDeConvite(orgId: string, userId: string, agora = Date.now()): string {
  if (!segredo()) throw new Error("INTERNAL_API_SECRET ausente: não dá para assinar o convite.");
  const carga = Buffer.from(`${orgId}\n${userId}\n${agora + VALIDADE_MS}`).toString("base64url");
  return `${carga}.${assinar(carga)}`;
}

export function lerTokenDeConvite(token: string | null | undefined, agora = Date.now()): { orgId: string; userId: string } | null {
  if (!token || !segredo()) return null;
  const [carga, assinatura] = token.split(".");
  if (!carga || !assinatura) return null;
  const esperada = Buffer.from(assinar(carga));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !crypto.timingSafeEqual(esperada, recebida)) return null;
  const [orgId, userId, vence] = Buffer.from(carga, "base64url").toString("utf8").split("\n");
  if (!orgId || !userId || !(Number(vence) > agora)) return null;
  return { orgId, userId };
}

// Cliente sem cookie e sem PKCE: o link do e-mail é aberto em outro navegador,
// que não teria o verificador do PKCE.
const clientePublico = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { flowType: "implicit", persistSession: false, autoRefreshToken: false },
  });

/** Manda o link pelo e-mail de "redefinir senha" do Supabase, o mesmo envio do convite de conta nova. */
export async function enviarLinkDoConvite(email: string, orgId: string, userId: string, origem: string): Promise<string | null> {
  const t = criarTokenDeConvite(orgId, userId);
  const { error } = await clientePublico().auth.resetPasswordForEmail(email, { redirectTo: `${origem}/convite?t=${encodeURIComponent(t)}` });
  return error ? error.message : null;
}

export class ErroDoConvite extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function aceitarConvite(token: string, senha: string): Promise<void> {
  const convite = lerTokenDeConvite(token);
  if (!convite) throw new ErroDoConvite("Este link de convite é inválido ou venceu. Peça um convite novo.");
  if (senha.length < 8) throw new ErroDoConvite("A senha precisa ter pelo menos 8 caracteres.");

  const vinculo = await prisma.membership.findUnique({
    where: { orgId_userId: { orgId: convite.orgId, userId: convite.userId } },
    select: { id: true, status: true },
  });
  if (vinculo?.status !== "pendente") throw new ErroDoConvite("Este convite não vale mais. Peça um convite novo.", 410);

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.updateUserById(convite.userId, { password: senha });
  if (error || !data.user?.email) throw new ErroDoConvite("Não foi possível salvar a senha. Tente de novo.", 500);

  // Derruba todas as sessões da conta (inclusive de quem a criou) antes de abrir o acesso.
  const entrada = await clientePublico().auth.signInWithPassword({ email: data.user.email, password: senha });
  const sessao = entrada.data.session;
  const saida = sessao ? await admin.auth.admin.signOut(sessao.access_token, "global") : null;
  if (!sessao || saida?.error) throw new ErroDoConvite("Não foi possível encerrar as outras sessões. Tente de novo.", 500);

  await prisma.membership.updateMany({ where: { id: vinculo.id, status: "pendente" }, data: { status: "convidado" } });
}
