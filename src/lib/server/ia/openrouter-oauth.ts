import "server-only";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Login no OpenRouter (OAuth PKCE), para o cliente ligar a conta dele sem
// copiar e colar chave. Fluxo (https://openrouter.ai/docs/use-cases/oauth-pkce):
//   1. /api/ia/openrouter/start gera o verificador e o state, guarda os dois
//      num cookie httpOnly (10 min, uso único) e manda a pessoa para
//      openrouter.ai/auth com o desafio S256.
//   2. O OpenRouter volta em /api/ia/openrouter/callback com ?code e ?state.
//   3. O callback confere o state e troca o código por uma chave em
//      POST /api/v1/auth/keys. A chave vira uma Credential "openrouter"
//      cifrada, igual às coladas à mão. O consumo sai dos créditos do
//      próprio cliente no OpenRouter.
// ---------------------------------------------------------------------------

export const COOKIE_OPENROUTER = "or_oauth";
const AUTH_URL = "https://openrouter.ai/auth";
const TROCA_URL = "https://openrouter.ai/api/v1/auth/keys";

const base64url = (b: Buffer) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function gerarVerificador(): string {
  return base64url(crypto.randomBytes(32));
}

export function gerarState(): string {
  return crypto.randomBytes(24).toString("hex");
}

/** Desafio S256 do PKCE: base64url(sha256(verificador)). */
export function desafioS256(verificador: string): string {
  return base64url(crypto.createHash("sha256").update(verificador).digest());
}

export function urlDeAutorizacao(opts: { callbackUrl: string; verificador: string; state: string; rotulo?: string }): string {
  const q = new URLSearchParams({
    callback_url: opts.callbackUrl,
    code_challenge: desafioS256(opts.verificador),
    code_challenge_method: "S256",
    state: opts.state,
  });
  if (opts.rotulo) q.set("key_label", opts.rotulo);
  return `${AUTH_URL}?${q.toString()}`;
}

/** Conteúdo do cookie: "<orgId>|<state>|<verificador>". */
export function montarCookie(orgId: string, state: string, verificador: string): string {
  return `${orgId}|${state}|${verificador}`;
}

export function lerCookie(valor: string | undefined): { orgId: string; state: string; verificador: string } | null {
  const partes = (valor ?? "").split("|");
  if (partes.length !== 3 || partes.some((p) => !p)) return null;
  return { orgId: partes[0], state: partes[1], verificador: partes[2] };
}

/** Compara o state sem vazar tempo (tamanhos diferentes = falso direto). */
export function stateConfere(esperado: string, recebido: string | null): boolean {
  if (!recebido || recebido.length !== esperado.length) return false;
  return crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(recebido));
}

export async function trocarCodigoPorChave(code: string, verificador: string): Promise<{ key: string } | { erro: string }> {
  try {
    const res = await fetch(TROCA_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code, code_verifier: verificador, code_challenge_method: "S256" }),
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) return { erro: `troca_${res.status}` };
    const data = await res.json();
    const key = typeof data?.key === "string" ? data.key.trim() : "";
    return key ? { key } : { erro: "sem_chave" };
  } catch {
    return { erro: "sem_resposta" };
  }
}
