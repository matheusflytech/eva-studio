// Qual app este deploy é. O mesmo código publica dois apps na Vercel:
//   eva       o Eva completo (padrão)
//   disparos  o app enxuto de disparos pelo WhatsApp via QR (agente, conversas,
//             contatos e disparos). Ver docs/superpowers/specs/2026-11-13-app-de-disparos-design.md
// NEXT_PUBLIC_*: entra no build, vale igual no servidor, no proxy e no navegador.

export type VarianteDoApp = "eva" | "disparos";

export function varianteDe(valor: string | undefined): VarianteDoApp {
  return valor === "disparos" ? "disparos" : "eva";
}

export const APP_VARIANT: VarianteDoApp = varianteDe(process.env.NEXT_PUBLIC_APP_VARIANT);
export const ehAppDeDisparos = APP_VARIANT === "disparos";
export const NOME_DO_APP = (process.env.NEXT_PUBLIC_APP_NAME || "").trim() || (ehAppDeDisparos ? "Disparos" : "Eva");

/**
 * O app de disparos é um ambiente único: um contrato só (NEXT_PUBLIC_APP_ORG_ID,
 * id completo), sem seletor e sem enxergar os contratos do Eva. Quem não é
 * membro dele não entra (o servidor confere em resolverContratoAtivo).
 */
export const ORG_DO_APP: string | null = ehAppDeDisparos ? (process.env.NEXT_PUBLIC_APP_ORG_ID || "").trim().toLowerCase() || null : null;

/** O contrato da URL (id curto ou completo) é o do app? */
export function ehOrgDoApp(org: string, contrato: string): boolean {
  const c = contrato.toLowerCase();
  return c === org || c === org.slice(0, 8);
}

/**
 * Ambiente único: para onde mandar um caminho que não é do contrato do app
 * (raiz, escolha de contrato, outro contrato). null = pode ficar.
 */
export function destinoNoAmbienteUnico(org: string | null, pathname: string): string | null {
  if (!org) return null;
  const [, primeiro] = pathname.split("/");
  const casa = `/${org.slice(0, 8)}/home`;
  if (pathname === "/" || primeiro === "contracts" || primeiro === "go") return casa;
  if (/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$|^[0-9a-f]{8}$/i.test(primeiro ?? "") && !ehOrgDoApp(org, primeiro)) {
    return pathname.replace(`/${primeiro}`, `/${org.slice(0, 8)}`);
  }
  return null;
}

/** Seções do contrato que o app de disparos mostra; o resto vai para /home. */
export const SECOES_DO_APP_DE_DISPAROS = new Set([
  "home",
  "broadcasts",
  "conversations",
  "contacts",
  "agent-studio",
  "settings",
  "help",
  "invite",
]);

/**
 * No app de disparos, para onde mandar /<contrato>/<secao>/... quando a seção
 * não faz parte dele (null = pode ficar). Caminhos fora de contrato (login,
 * api...) não passam por aqui.
 */
export function redirecionarSecao(variante: VarianteDoApp, contrato: string, secao: string): string | null {
  if (variante !== "disparos") return null;
  return SECOES_DO_APP_DE_DISPAROS.has(secao) ? null : `/${contrato}/home`;
}
