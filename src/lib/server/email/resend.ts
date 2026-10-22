import "server-only";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Resend da PLATAFORMA (conta da Eva, RESEND_API_KEY na Vercel). Cada contrato
// verifica o próprio domínio dentro dessa conta e envia como ele mesmo.
// REST direto, sem SDK, como o resto do app.
//
// Domínios: https://resend.com/docs/api-reference/domains
// Webhook (assinado pelo Svix): HMAC-SHA256 de "<svix-id>.<svix-timestamp>.<corpo>"
// com o segredo "whsec_<base64>"; o cabeçalho svix-signature traz "v1,<base64>"
// (um ou mais, separados por espaço).
// ---------------------------------------------------------------------------

const API = "https://api.resend.com";

export const chaveDaPlataforma = () => process.env.RESEND_API_KEY ?? "";
export const resendConfigurado = () => !!chaveDaPlataforma();

async function chamar(caminho: string, init: RequestInit = {}): Promise<{ ok: true; corpo: Record<string, unknown> } | { ok: false; erro: string; status: number }> {
  const chave = chaveDaPlataforma();
  if (!chave) return { ok: false, erro: "O envio de e-mail não está configurado neste ambiente (RESEND_API_KEY).", status: 503 };
  try {
    const res = await fetch(`${API}${caminho}`, {
      ...init,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${chave}`, ...(init.headers ?? {}) },
      signal: AbortSignal.timeout(15_000),
      cache: "no-store",
    });
    const corpo = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg = typeof corpo.message === "string" ? corpo.message : `A Resend respondeu ${res.status}.`;
      return { ok: false, erro: msg.slice(0, 300), status: res.status };
    }
    return { ok: true, corpo };
  } catch {
    return { ok: false, erro: "A Resend não respondeu. Tente de novo em instantes.", status: 502 };
  }
}

// --- envio -------------------------------------------------------------------

export interface EmailParaEnviar {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | null;
  /** List-Unsubscribe e afins. */
  headers?: Record<string, string>;
  /** Etiquetas que voltam no webhook (ex.: envio=<id>). Só [A-Za-z0-9_-]. */
  tags?: Record<string, string>;
}

export async function enviarEmail(e: EmailParaEnviar): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const r = await chamar("/emails", {
    method: "POST",
    body: JSON.stringify({
      from: e.from,
      to: [e.to],
      subject: e.subject,
      html: e.html,
      text: e.text,
      ...(e.replyTo ? { reply_to: e.replyTo } : {}),
      ...(e.headers ? { headers: e.headers } : {}),
      ...(e.tags ? { tags: Object.entries(e.tags).map(([name, value]) => ({ name, value })) } : {}),
    }),
  });
  if (!r.ok) return { ok: false, erro: r.erro };
  const id = typeof r.corpo.id === "string" ? r.corpo.id : "";
  return id ? { ok: true, id } : { ok: false, erro: "A Resend não devolveu o id do e-mail." };
}

// --- domínios ----------------------------------------------------------------

export interface RegistroDns {
  record: string;
  name: string;
  type: string;
  value: string;
  ttl?: string;
  priority?: number;
  status?: string;
}

export interface DominioDaResend {
  id: string;
  name: string;
  /** not_started | pending | verified | failed | temporary_failure */
  status: string;
  records: RegistroDns[];
}

function lerDominio(corpo: Record<string, unknown>): DominioDaResend {
  const records = Array.isArray(corpo.records) ? (corpo.records as RegistroDns[]) : [];
  return { id: String(corpo.id ?? ""), name: String(corpo.name ?? ""), status: String(corpo.status ?? "not_started"), records };
}

export async function criarDominio(nome: string) {
  // sa-east-1: entrega mais perto dos clientes (Brasil).
  const r = await chamar("/domains", { method: "POST", body: JSON.stringify({ name: nome, region: "sa-east-1" }) });
  return r.ok ? { ok: true as const, dominio: lerDominio(r.corpo) } : r;
}

export async function buscarDominio(id: string) {
  const r = await chamar(`/domains/${encodeURIComponent(id)}`);
  return r.ok ? { ok: true as const, dominio: lerDominio(r.corpo) } : r;
}

export async function pedirVerificacao(id: string) {
  const r = await chamar(`/domains/${encodeURIComponent(id)}/verify`, { method: "POST" });
  return r.ok ? { ok: true as const } : r;
}

export async function apagarDominio(id: string) {
  const r = await chamar(`/domains/${encodeURIComponent(id)}`, { method: "DELETE" });
  return r.ok || r.status === 404 ? { ok: true as const } : r;
}

// --- webhook -----------------------------------------------------------------

/** Tolerância do carimbo de tempo (contra reenvio de requisição antiga). */
const TOLERANCIA_S = 5 * 60;

export function assinaturaDoWebhookConfere(
  corpo: string,
  cabecalhos: { id: string | null; timestamp: string | null; assinatura: string | null },
  segredo: string,
  agora: Date = new Date()
): boolean {
  const { id, timestamp, assinatura } = cabecalhos;
  if (!id || !timestamp || !assinatura || !segredo) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(agora.getTime() / 1000 - ts) > TOLERANCIA_S) return false;

  const chave = Buffer.from(segredo.replace(/^whsec_/, ""), "base64");
  const esperado = crypto.createHmac("sha256", chave).update(`${id}.${timestamp}.${corpo}`).digest();
  return assinatura.split(" ").some((parte) => {
    const [versao, valor] = parte.split(",");
    if (versao !== "v1" || !valor) return false;
    const recebido = Buffer.from(valor, "base64");
    return recebido.length === esperado.length && crypto.timingSafeEqual(recebido, esperado);
  });
}
