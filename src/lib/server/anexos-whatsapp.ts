import "server-only";
import { entenderAnexo, MAX_ANEXO_BYTES } from "@/lib/server/anexos";
import { baixarMidia } from "@/lib/server/storage";
import { transcreverAudio } from "@/lib/server/transcribe";

// O que chega no WhatsApp além de texto. O arquivo já foi guardado no Storage
// (media-inbound.ts / worker); aqui a IA ouve o áudio e lê a foto e o documento.

/** Decisão do dono (24/10/2026): áudio acima disto não é transcrito. */
export const MAX_SEGUNDOS_DE_AUDIO = 5 * 60;
/** Documento maior que isto não é lido (PDF de 10 MB já é um livro). */
const MAX_DOCUMENTO_BYTES = 10 * 1024 * 1024;
/** Anexos lidos por resposta (várias fotos seguidas, cada uma custa uma chamada). */
const MAX_ANEXOS = 3;

export interface AnexoGuardado {
  path: string;
  type: string;
  mime: string;
  name?: string | null;
}

async function baixar(caminho: string): Promise<Buffer | null> {
  try {
    return await baixarMidia(caminho);
  } catch (err) {
    console.error("[anexos-whatsapp] download", err);
    return null;
  }
}

/**
 * Áudio vira o texto da mensagem: é o que a equipe lê em Conversas e o que a
 * IA responde. null quando não deu para ouvir (fica o "[Áudio]" de sempre).
 */
export async function transcreverAudioDoWhatsApp(orgId: string, anexo: AnexoGuardado): Promise<string | null> {
  const bytes = await baixar(anexo.path);
  if (!bytes) return null;
  const longo = "[Áudio longo demais para transcrever (mais de 5 min). Diga que a equipe vai ouvir e responder.]";
  const r = await transcreverAudio(orgId, bytes.toString("base64"), anexo.mime);
  if ("erro" in r) return r.erro === "tamanho" ? longo : null;
  return r.segundos && r.segundos > MAX_SEGUNDOS_DE_AUDIO ? longo : r.texto;
}

/** Fotos e documentos viram contexto para a IA (não vai para a conversa). */
export async function entenderAnexosDoWhatsApp(orgId: string, anexos: AnexoGuardado[]): Promise<string | undefined> {
  const partes: string[] = [];
  for (const a of anexos.filter((x) => x.type === "image" || x.type === "document").slice(0, MAX_ANEXOS)) {
    const bytes = await baixar(a.path);
    if (!bytes) continue;
    const nome = a.name ?? "";
    if (bytes.byteLength > (a.type === "image" ? MAX_ANEXO_BYTES : MAX_DOCUMENTO_BYTES)) {
      partes.push(`[Anexo enviado pelo cliente: ${nome || a.type}, grande demais para ler. Peça para a pessoa resumir o conteúdo.]`);
      continue;
    }
    partes.push(await entenderAnexo(orgId, bytes, a.mime, nome));
  }
  return partes.length ? partes.join("\n\n") : undefined;
}
