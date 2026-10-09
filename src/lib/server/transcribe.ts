import "server-only";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/server/crypto";

// Transcreve áudio do visitante com o Whisper da Groq. Usa a credencial Groq
// da organização do agente; sem ela, cai na variável GROQ_API_KEY do ambiente.

export const MAX_AUDIO_BYTES = 6 * 1024 * 1024;

async function chaveGroq(orgId: string): Promise<string | null> {
  const cred = await prisma.credential.findFirst({ where: { orgId, type: "groq" }, orderBy: { createdAt: "desc" } });
  if (cred) {
    try {
      return decryptSecret(cred.secretEnc);
    } catch {
      /* cai no ambiente */
    }
  }
  return process.env.GROQ_API_KEY || null;
}

export async function transcreverAudio(
  orgId: string,
  base64: string,
  mime: string,
  lang?: string
): Promise<{ texto: string } | { erro: string }> {
  const chave = await chaveGroq(orgId);
  if (!chave) return { erro: "sem_chave" };

  const bytes = Buffer.from(base64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_AUDIO_BYTES) return { erro: "tamanho" };

  const ext = mime.includes("mp4") ? "mp4" : mime.includes("ogg") ? "ogg" : "webm";
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(bytes)], { type: mime }), `audio.${ext}`);
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", lang === "en" ? "en" : lang === "es" ? "es" : "pt");

  try {
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}` },
      body: form,
    });
    if (!res.ok) {
      console.error("[transcribe]", res.status, (await res.text()).slice(0, 200));
      return { erro: "falha" };
    }
    const d = (await res.json()) as { text?: string };
    const texto = (d.text ?? "").trim();
    return texto ? { texto } : { erro: "vazio" };
  } catch (err) {
    console.error("[transcribe]", err);
    return { erro: "falha" };
  }
}
