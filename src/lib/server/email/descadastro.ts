import "server-only";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Link de descadastro que vai em todo e-mail (rodapé e List-Unsubscribe).
//
// O link carrega o contrato e o e-mail, assinados com HMAC: ninguém consegue
// descadastrar outra pessoa trocando o endereço na URL. Não expira (quem
// abre um e-mail de meses atrás ainda tem de conseguir sair).
// ---------------------------------------------------------------------------

function segredo(): string {
  return process.env.EMAIL_DESCADASTRO_SECRET || process.env.INTERNAL_API_SECRET || "";
}

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");

function assinar(carga: string): string {
  return crypto.createHmac("sha256", segredo()).update(`descadastro:${carga}`).digest("base64url");
}

export function criarTokenDeDescadastro(orgId: string, email: string): string {
  const carga = b64url(`${orgId}\n${email.trim().toLowerCase()}`);
  return `${carga}.${assinar(carga)}`;
}

export function lerTokenDeDescadastro(token: string | null | undefined): { orgId: string; email: string } | null {
  if (!token || !segredo()) return null;
  const [carga, assinatura] = token.split(".");
  if (!carga || !assinatura) return null;
  const esperada = Buffer.from(assinar(carga));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !crypto.timingSafeEqual(esperada, recebida)) return null;
  const [orgId, email] = Buffer.from(carga, "base64url").toString("utf8").split("\n");
  return orgId && email ? { orgId, email } : null;
}

export function baseDoApp(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
  );
}

/** Página que a pessoa vê (rodapé do e-mail). */
export const linkDaPaginaDeDescadastro = (token: string) => `${baseDoApp()}/unsubscribe?t=${encodeURIComponent(token)}`;

/** Endereço do descadastro em um clique (List-Unsubscribe-Post, RFC 8058). */
export const linkDoDescadastroDireto = (token: string) => `${baseDoApp()}/api/email/descadastro?t=${encodeURIComponent(token)}`;
