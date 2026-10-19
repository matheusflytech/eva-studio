import "server-only";
import { FACEBOOK_GRAPH } from "@/lib/server/meta-graph";
import type { PayloadTemplateMeta } from "@/lib/whatsapp/template-meta";

// ---------------------------------------------------------------------------
// Criação de template na Meta (Graph API) e upload da mídia de exemplo.
//
// Revisão da Meta leva de minutos a 24h; o status chega depois pelo webhook
// message_template_status_update (ver meta-template-eventos.ts).
// ---------------------------------------------------------------------------

export type ResultadoCriacao =
  | { ok: true; id: string; status: string; category: string }
  | { ok: false; erro: string };

interface ErroGraph {
  error?: {
    message?: string;
    code?: number;
    error_subcode?: number;
    error_user_title?: string;
    error_user_msg?: string;
  };
}

function erroLegivel(json: ErroGraph, status: number): string {
  const e = json.error ?? {};
  if (e.code === 190 || e.code === 102) return "O acesso à Meta expirou ou foi revogado. Reconecte o canal na aba do agente.";
  if (e.code === 200 || e.code === 10) {
    return "O token não tem permissão para criar template (precisa de whatsapp_business_management).";
  }
  if (e.error_subcode === 2388024 || e.error_subcode === 2388023) {
    return "Já existe um template com esse nome e idioma (ou um apagado há menos de 30 dias). Use outro nome.";
  }
  if (e.code === 80008 || e.code === 4) return "A Meta limitou as chamadas por agora. Tente de novo em instantes.";
  const detalhe = e.error_user_msg ?? e.message;
  return detalhe ? `A Meta recusou: ${detalhe}`.slice(0, 400) : `A Meta respondeu ${status}.`;
}

export async function criarTemplateNaMeta(
  wabaId: string,
  accessToken: string,
  payload: PayloadTemplateMeta
): Promise<ResultadoCriacao> {
  try {
    const res = await fetch(`${FACEBOOK_GRAPH}/${wabaId}/message_templates`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as ErroGraph & { id?: string; status?: string; category?: string };
    if (!res.ok || !json.id) return { ok: false, erro: erroLegivel(json, res.status) };
    return { ok: true, id: json.id, status: json.status ?? "PENDING", category: json.category ?? payload.category };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? `Falha de rede: ${e.message}` : "Falha de rede." };
  }
}

// Tipos que a Meta aceita como exemplo de cabeçalho.
export const MIDIAS_DE_CABECALHO: Record<string, "IMAGE" | "VIDEO" | "DOCUMENT"> = {
  "image/jpeg": "IMAGE",
  "image/png": "IMAGE",
  "video/mp4": "VIDEO",
  "application/pdf": "DOCUMENT",
};

export const LIMITE_MIDIA_EXEMPLO = 4 * 1024 * 1024;

/**
 * Resumable Upload API: abre uma sessão no app (META_APP_ID) e manda os bytes.
 * O "h" devolvido é o header_handle que vai no exemplo do cabeçalho.
 */
export async function subirMidiaDeExemplo(
  accessToken: string,
  bytes: Uint8Array,
  mime: string,
  nome: string
): Promise<{ ok: true; handle: string } | { ok: false; erro: string }> {
  const appId = process.env.META_APP_ID;
  if (!appId) return { ok: false, erro: "META_APP_ID não configurado: sem ele a Meta não recebe o arquivo de exemplo." };
  if (!MIDIAS_DE_CABECALHO[mime]) return { ok: false, erro: "Use JPG, PNG, MP4 ou PDF no cabeçalho." };
  if (bytes.byteLength > LIMITE_MIDIA_EXEMPLO) return { ok: false, erro: "O arquivo de exemplo precisa ter até 4 MB." };

  try {
    const sessao = new URL(`${FACEBOOK_GRAPH}/${appId}/uploads`);
    sessao.searchParams.set("file_name", nome || "exemplo");
    sessao.searchParams.set("file_length", String(bytes.byteLength));
    sessao.searchParams.set("file_type", mime);

    const r1 = await fetch(sessao.toString(), {
      method: "POST",
      headers: { Authorization: `OAuth ${accessToken}` },
      cache: "no-store",
    });
    const j1 = (await r1.json().catch(() => ({}))) as ErroGraph & { id?: string };
    if (!r1.ok || !j1.id) return { ok: false, erro: erroLegivel(j1, r1.status) };

    const r2 = await fetch(`${FACEBOOK_GRAPH}/${j1.id}`, {
      method: "POST",
      headers: { Authorization: `OAuth ${accessToken}`, file_offset: "0", "Content-Type": mime },
      body: bytes as unknown as BodyInit,
      cache: "no-store",
    });
    const j2 = (await r2.json().catch(() => ({}))) as ErroGraph & { h?: string };
    if (!r2.ok || !j2.h) return { ok: false, erro: erroLegivel(j2, r2.status) };
    return { ok: true, handle: j2.h };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? `Falha de rede: ${e.message}` : "Falha de rede." };
  }
}
