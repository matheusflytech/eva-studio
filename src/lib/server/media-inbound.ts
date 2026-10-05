import "server-only";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/server/crypto";
import {
  classificarMime,
  enviarMidia,
  mimeBase,
  MAX_MEDIA_BYTES,
  novoCaminho,
  type TipoDeMidia,
} from "@/lib/server/storage";

// ---------------------------------------------------------------------------
// Anexos que chegam do cliente.
//
// Foto da conta de luz, áudio explicando o problema, PDF do contrato. Antes
// disso o webhook só olhava texto e botão (`if (!optionId && !text) continue`):
// qualquer outra coisa que o cliente mandasse sumia sem deixar rastro, nem na
// caixa de entrada. Num atendimento por WhatsApp, onde metade da conversa é
// foto e áudio, isso é perder metade do que o cliente diz.
//
// Regra que vale pra tudo aqui: NUNCA lançar. Se o download falhar, a mensagem
// continua existindo (com um aviso no texto); o pior caso é um anexo faltando,
// não uma conversa que perdeu a mensagem.
// ---------------------------------------------------------------------------

const GRAPH = "https://graph.facebook.com/v21.0";

export interface MidiaGuardada {
  path: string;
  type: TipoDeMidia;
  mime: string;
  name?: string;
  size: number;
}

const ROTULO: Record<string, string> = {
  image: "Foto",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
  sticker: "Figurinha",
};

export function rotuloDoTipo(tipo: string): string {
  return ROTULO[tipo] ?? "Anexo";
}

/** Texto que fica na conversa quando o anexo veio sem legenda. */
export function textoDeAnexo(tipo: string, legenda?: string, falhou = false): string {
  const base = legenda?.trim() || `[${rotuloDoTipo(tipo)}]`;
  return falhou ? `${base} (não foi possível baixar o arquivo)` : base;
}

const cacheDeOrg = new Map<string, { orgId: string; em: number }>();

/** A organização dona do agente — o anexo é guardado sob o prefixo dela. */
export async function orgDoAgente(agentId: string): Promise<string | null> {
  const cached = cacheDeOrg.get(agentId);
  if (cached && Date.now() - cached.em < 10 * 60_000) return cached.orgId;
  const agent = await prisma.agent.findUnique({ where: { id: agentId }, select: { orgId: true } });
  if (!agent) return null;
  cacheDeOrg.set(agentId, { orgId: agent.orgId, em: Date.now() });
  return agent.orgId;
}

export async function guardarBuffer(
  orgId: string,
  corpo: Uint8Array | Buffer,
  mime: string,
  opcoes: { name?: string; tipoForcado?: TipoDeMidia } = {}
): Promise<MidiaGuardada | null> {
  try {
    const classe = classificarMime(mime);
    if (!classe) return null;
    if (corpo.byteLength === 0 || corpo.byteLength > MAX_MEDIA_BYTES) return null;
    const path = novoCaminho(orgId, classe.ext);
    await enviarMidia(path, corpo, mime);
    return {
      path,
      type: opcoes.tipoForcado ?? classe.tipo,
      mime: mimeBase(mime),
      name: opcoes.name?.slice(0, 200),
      size: corpo.byteLength,
    };
  } catch (e) {
    console.error("[media-inbound] falha ao guardar", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Baixa de uma URL (CDN da Meta, Telegram) e guarda. */
export async function baixarEGuardar(
  orgId: string,
  url: string,
  opcoes: { headers?: Record<string, string>; mimeDica?: string; name?: string; tipoForcado?: TipoDeMidia } = {}
): Promise<MidiaGuardada | null> {
  try {
    const res = await fetch(url, {
      headers: opcoes.headers,
      signal: AbortSignal.timeout(20_000),
      redirect: "follow",
    });
    if (!res.ok) return null;

    const declarado = Number(res.headers.get("content-length") ?? 0);
    if (declarado > MAX_MEDIA_BYTES) return null;

    const mime = res.headers.get("content-type") || opcoes.mimeDica || "";
    const corpo = new Uint8Array(await res.arrayBuffer());
    // Content-Type de CDN às vezes vem como "application/octet-stream"; a dica
    // do próprio webhook é mais confiável nesse caso.
    const mimeFinal = classificarMime(mime) ? mime : opcoes.mimeDica || mime;
    return await guardarBuffer(orgId, corpo, mimeFinal, { name: opcoes.name, tipoForcado: opcoes.tipoForcado });
  } catch (e) {
    console.error("[media-inbound] falha ao baixar", e instanceof Error ? e.message : e);
    return null;
  }
}

/** WhatsApp Cloud API: o webhook traz só o id da mídia; a URL sai de uma segunda chamada. */
export async function guardarMidiaWhatsApp(
  orgId: string,
  mediaId: string,
  accessToken: string,
  opcoes: { mimeDica?: string; name?: string; tipoForcado?: TipoDeMidia } = {}
): Promise<MidiaGuardada | null> {
  try {
    const meta = await fetch(`${GRAPH}/${mediaId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15_000),
    });
    if (!meta.ok) return null;
    const info = (await meta.json()) as { url?: string; mime_type?: string; file_size?: number };
    if (!info.url) return null;
    if ((info.file_size ?? 0) > MAX_MEDIA_BYTES) return null;

    // A URL da Meta exige o mesmo token e expira em minutos: baixar na hora.
    return await baixarEGuardar(orgId, info.url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      mimeDica: info.mime_type ?? opcoes.mimeDica,
      name: opcoes.name,
      tipoForcado: opcoes.tipoForcado,
    });
  } catch (e) {
    console.error("[media-inbound] falha na mídia do WhatsApp", e instanceof Error ? e.message : e);
    return null;
  }
}

/** Telegram: file_id -> getFile -> download. */
export async function guardarMidiaTelegram(
  orgId: string,
  botTokenCifrado: string,
  fileId: string,
  opcoes: { mimeDica?: string; name?: string; tipoForcado?: TipoDeMidia } = {}
): Promise<MidiaGuardada | null> {
  try {
    const token = decryptSecret(botTokenCifrado);
    const meta = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!meta.ok) return null;
    const json = (await meta.json()) as { result?: { file_path?: string; file_size?: number } };
    const caminho = json.result?.file_path;
    if (!caminho) return null;
    if ((json.result?.file_size ?? 0) > MAX_MEDIA_BYTES) return null;
    return await baixarEGuardar(orgId, `https://api.telegram.org/file/bot${token}/${caminho}`, {
      mimeDica: opcoes.mimeDica ?? mimePelaExtensao(caminho),
      name: opcoes.name,
      tipoForcado: opcoes.tipoForcado,
    });
  } catch (e) {
    console.error("[media-inbound] falha na mídia do Telegram", e instanceof Error ? e.message : e);
    return null;
  }
}

function mimePelaExtensao(caminho: string): string | undefined {
  const ext = caminho.split(".").pop()?.toLowerCase();
  const mapa: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif",
    ogg: "audio/ogg", oga: "audio/ogg", mp3: "audio/mpeg", m4a: "audio/mp4", wav: "audio/wav",
    mp4: "video/mp4", pdf: "application/pdf", txt: "text/plain",
  };
  return ext ? mapa[ext] : undefined;
}

/** Instagram e Messenger entregam uma lista de attachments com a URL pública no payload. */
export function tipoDoAnexoSocial(tipo: string | undefined): TipoDeMidia | null {
  if (tipo === "image") return "image";
  if (tipo === "audio") return "audio";
  if (tipo === "video") return "video";
  if (tipo === "file") return "document";
  return null;
}
