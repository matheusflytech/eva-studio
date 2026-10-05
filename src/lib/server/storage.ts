import "server-only";
import { randomUUID } from "node:crypto";

// ---------------------------------------------------------------------------
// Armazenamento de anexos.
//
// A foto da conta de luz que o cliente manda, o PDF da proposta que o
// atendente devolve. O arquivo mora no Storage do Supabase, num bucket
// PRIVADO; no banco fica só o caminho. Bucket privado porque o anexo de um
// cliente é dado pessoal: URL pública permanente significaria que quem
// descobrisse o endereço de uma foto de documento poderia abri-la pra sempre.
// Quem precisa ver ou reenviar o arquivo recebe uma URL assinada que expira.
//
// Fala com a API REST direto, sem trazer mais uma camada: são quatro chamadas.
// ---------------------------------------------------------------------------

const BUCKET = "eva-media";

/** 16 MB: é o teto do WhatsApp para mídia, e acima disso o canal recusa de qualquer jeito. */
export const MAX_MEDIA_BYTES = 16 * 1024 * 1024;

export type TipoDeMidia = "image" | "audio" | "video" | "document" | "sticker";

/**
 * O que aceitamos guardar. Lista fechada de propósito: aceitar "qualquer
 * coisa" num endpoint de upload é como se hospeda executável no domínio dos
 * outros. Cobre o que WhatsApp, Instagram, Messenger e Telegram transportam.
 */
const MIME_PERMITIDOS: Record<string, { tipo: TipoDeMidia; ext: string }> = {
  "image/jpeg": { tipo: "image", ext: "jpg" },
  "image/png": { tipo: "image", ext: "png" },
  "image/webp": { tipo: "image", ext: "webp" },
  "image/gif": { tipo: "image", ext: "gif" },
  "audio/ogg": { tipo: "audio", ext: "ogg" },
  "audio/mpeg": { tipo: "audio", ext: "mp3" },
  "audio/mp4": { tipo: "audio", ext: "m4a" },
  "audio/aac": { tipo: "audio", ext: "aac" },
  "audio/amr": { tipo: "audio", ext: "amr" },
  "audio/wav": { tipo: "audio", ext: "wav" },
  "audio/webm": { tipo: "audio", ext: "webm" },
  "video/mp4": { tipo: "video", ext: "mp4" },
  "video/3gpp": { tipo: "video", ext: "3gp" },
  "video/webm": { tipo: "video", ext: "webm" },
  "application/pdf": { tipo: "document", ext: "pdf" },
  "text/plain": { tipo: "document", ext: "txt" },
  "text/csv": { tipo: "document", ext: "csv" },
  "application/msword": { tipo: "document", ext: "doc" },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { tipo: "document", ext: "docx" },
  "application/vnd.ms-excel": { tipo: "document", ext: "xls" },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { tipo: "document", ext: "xlsx" },
  "application/vnd.ms-powerpoint": { tipo: "document", ext: "ppt" },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { tipo: "document", ext: "pptx" },
};

/** Normaliza "audio/ogg; codecs=opus" para "audio/ogg". */
export function mimeBase(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

export function classificarMime(mime: string): { tipo: TipoDeMidia; ext: string } | null {
  return MIME_PERMITIDOS[mimeBase(mime)] ?? null;
}

function config(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Storage não configurado: faltam NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY.");
  return { url: url.replace(/\/$/, ""), key };
}

function cabecalho(key: string, extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${key}`, apikey: key, ...extra };
}

let bucketGarantido: Promise<void> | null = null;

/** Cria o bucket na primeira vez. Idempotente: "já existe" não é erro. */
function garantirBucket(): Promise<void> {
  if (bucketGarantido) return bucketGarantido;
  bucketGarantido = (async () => {
    const { url, key } = config();
    const res = await fetch(`${url}/storage/v1/bucket`, {
      method: "POST",
      headers: cabecalho(key, { "Content-Type": "application/json" }),
      body: JSON.stringify({ id: BUCKET, name: BUCKET, public: false, file_size_limit: MAX_MEDIA_BYTES }),
    });
    if (res.ok || res.status === 409) return;
    const texto = await res.text();
    // O Supabase devolve 400 com "already exists" em algumas versões.
    if (/already exists|Duplicate/i.test(texto)) return;
    bucketGarantido = null; // tenta de novo na próxima, em vez de cachear a falha
    throw new Error(`Não foi possível preparar o armazenamento (${res.status}).`);
  })();
  return bucketGarantido;
}

/** Caminho novo: separado por organização, com nome aleatório (não adivinhável). */
export function novoCaminho(orgId: string, ext: string): string {
  const agora = new Date();
  const mes = String(agora.getUTCMonth() + 1).padStart(2, "0");
  return `${orgId}/${agora.getUTCFullYear()}/${mes}/${randomUUID()}.${ext}`;
}

export async function enviarMidia(caminho: string, corpo: Uint8Array | Buffer, mime: string): Promise<void> {
  if (corpo.byteLength > MAX_MEDIA_BYTES) throw new Error("Arquivo maior que 16 MB.");
  await garantirBucket();
  const { url, key } = config();
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${caminho}`, {
    method: "POST",
    headers: cabecalho(key, { "Content-Type": mimeBase(mime), "x-upsert": "false" }),
    body: corpo as BodyInit,
  });
  if (!res.ok) throw new Error(`Falha ao guardar o arquivo (${res.status}).`);
}

/** URL temporária pra ver ou reenviar o arquivo. Expira: é de propósito. */
export async function urlAssinada(caminho: string, segundos = 3600): Promise<string | null> {
  try {
    await garantirBucket();
    const { url, key } = config();
    const res = await fetch(`${url}/storage/v1/object/sign/${BUCKET}/${caminho}`, {
      method: "POST",
      headers: cabecalho(key, { "Content-Type": "application/json" }),
      body: JSON.stringify({ expiresIn: segundos }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { signedURL?: string };
    return json.signedURL ? `${url}/storage/v1${json.signedURL}` : null;
  } catch {
    return null;
  }
}

/** Assina várias de uma vez, sem derrubar a lista se uma falhar. */
export async function urlsAssinadas(caminhos: string[], segundos = 3600): Promise<Map<string, string>> {
  const unicos = [...new Set(caminhos)];
  const pares = await Promise.all(unicos.map(async (c) => [c, await urlAssinada(c, segundos)] as const));
  return new Map(pares.filter((p): p is readonly [string, string] => !!p[1]));
}

/** Só quem tem o prefixo da própria organização pode tocar no arquivo. */
export function caminhoDaOrg(caminho: string, orgId: string): boolean {
  return caminho.startsWith(`${orgId}/`) && !caminho.includes("..");
}

/**
 * URL de upload direto.
 *
 * A Vercel limita o corpo de uma requisição a 4,5 MB, então subir um PDF de
 * 10 MB passando por uma rota nossa falharia. O caminho certo é a rota só
 * AUTORIZAR e o navegador (ou o worker) mandar o arquivo direto pro storage,
 * por uma URL assinada de uso único.
 */
export async function urlDeUpload(caminho: string): Promise<{ url: string; token: string } | null> {
  try {
    await garantirBucket();
    const { url, key } = config();
    const res = await fetch(`${url}/storage/v1/object/upload/sign/${BUCKET}/${caminho}`, {
      method: "POST",
      // Sem Content-Type: com JSON declarado e corpo vazio o Supabase recusa.
      headers: cabecalho(key),
    });
    if (!res.ok) {
      console.error("[storage] upload assinado recusado", res.status, (await res.text()).slice(0, 200));
      return null;
    }
    const json = (await res.json()) as { url?: string; token?: string };
    if (!json.url) return null;
    const completa = `${url}/storage/v1${json.url}`;
    // O token vem dentro da propria URL; alguns retornos trazem tambem num campo.
    const token = json.token ?? new URL(completa).searchParams.get("token") ?? "";
    return { url: completa, token };
  } catch (e) {
    console.error("[storage] falha ao preparar o upload", e instanceof Error ? e.message : e);
    return null;
  }
}

/** O arquivo existe de fato? Confere depois do upload, antes de aceitar o caminho. */
export async function midiaExiste(caminho: string): Promise<{ existe: boolean; tamanho: number }> {
  try {
    const { url, key } = config();
    const res = await fetch(`${url}/storage/v1/object/info/${BUCKET}/${caminho}`, { headers: cabecalho(key) });
    if (!res.ok) return { existe: false, tamanho: 0 };
    const info = (await res.json()) as { size?: number; metadata?: { size?: number } };
    return { existe: true, tamanho: Number(info.size ?? info.metadata?.size ?? 0) };
  } catch {
    return { existe: false, tamanho: 0 };
  }
}
