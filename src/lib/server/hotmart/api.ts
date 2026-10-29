import "server-only";
import type { ApiCredentials } from "./connection";

// ---------------------------------------------------------------------------
// Cliente da API da Hotmart para a importação do histórico. Só lê: o único
// POST é o do token (OAuth client_credentials). Respeita o limite de 500
// chamadas/min: no 429 espera o RateLimit-Reset e tenta de novo; no 401 pede
// outro token uma vez. As URLs aceitam troca por variável de ambiente para o
// teste local apontar para um servidor falso (nunca para a Hotmart de verdade).
// ---------------------------------------------------------------------------

const AUTH_URL = () => process.env.HOTMART_AUTH_URL || "https://api-sec-vlc.hotmart.com/security/oauth/token";
const API_URL = () => process.env.HOTMART_API_URL || "https://developers.hotmart.com/payments/api/v1";
const MAX_RETRIES = 3;

export interface ApiDeps {
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}
export type Params = Record<string, string | number | string[] | undefined>;
/* eslint-disable-next-line @typescript-eslint/no-explicit-any -- resposta externa, lida em lib/hotmart/history.ts */
export interface Page { items: any[]; nextPageToken: string | null }

const tokens = new Map<string, { token: string; expiresAt: number }>();

export class HotmartApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

// Erro de rede vira HotmartApiError (status 0) para o painel mostrar o motivo.
async function call(deps: ApiDeps, url: URL, init: RequestInit): Promise<Response> {
  try {
    return await (deps.fetch ?? fetch)(url, init);
  } catch (e) {
    throw new HotmartApiError(`Não consegui falar com a Hotmart (${e instanceof Error ? e.message : String(e)}).`, 0);
  }
}

/** Motivo que a Hotmart manda no corpo do erro, se houver. */
async function reasonOf(res: Response): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const d = JSON.parse(text);
    return String(d.error_description || d.message || d.error || "").slice(0, 200);
  } catch {
    return text.slice(0, 200);
  }
}

async function getToken(c: ApiCredentials, deps: ApiDeps, fresh = false): Promise<string> {
  const now = (deps.now ?? Date.now)();
  const cached = tokens.get(c.clientId);
  if (!fresh && cached && cached.expiresAt > now) return cached.token;
  const url = new URL(AUTH_URL());
  url.searchParams.set("grant_type", "client_credentials");
  url.searchParams.set("client_id", c.clientId);
  url.searchParams.set("client_secret", c.clientSecret);
  const basic = c.basic.replace(/^Basic\s+/i, "");
  const res = await call(deps, url, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/json" } });
  if (!res.ok) {
    const reason = await reasonOf(res);
    const base = res.status === 400 || res.status === 401 || res.status === 403 ? "Credenciais da API da Hotmart recusadas. Confira Client ID, Client Secret e Basic." : `Hotmart recusou o token (${res.status}).`;
    throw new HotmartApiError(reason ? `${base} Hotmart: ${reason}` : base, res.status);
  }
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) throw new HotmartApiError("Hotmart não devolveu o token de acesso.", res.status);
  // Renova 60 s antes de vencer.
  tokens.set(c.clientId, { token: data.access_token, expiresAt: now + (Number(data.expires_in) || 3600) * 1000 - 60_000 });
  return data.access_token;
}

/** Uma página de uma listagem (`/sales/history`, `/sales/users`, `/subscriptions`). */
export async function getPage(c: ApiCredentials, path: string, params: Params, deps: ApiDeps = {}): Promise<Page> {
  const url = new URL(`${API_URL()}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    for (const x of Array.isArray(v) ? v : [v]) url.searchParams.append(k, String(x));
  }
  const sleep = deps.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  let token = await getToken(c, deps);
  let renewed = false;
  for (let attempt = 0; ; attempt++) {
    const res = await call(deps, url, { method: "GET", headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
    if (res.status === 401 && !renewed) {
      renewed = true;
      token = await getToken(c, deps, true);
      continue;
    }
    if (res.status === 429 && attempt < MAX_RETRIES) {
      const reset = Number(res.headers.get("RateLimit-Reset"));
      await sleep(Math.min(reset > 0 ? reset * 1000 : 10_000, 60_000));
      continue;
    }
    if (!res.ok) {
      const reason = await reasonOf(res);
      throw new HotmartApiError(`Hotmart respondeu ${res.status} em ${path}.${reason ? ` Motivo: ${reason}` : ""}`, res.status);
    }
    const data = await res.json();
    return { items: Array.isArray(data?.items) ? data.items : [], nextPageToken: data?.page_info?.next_page_token || null };
  }
}
