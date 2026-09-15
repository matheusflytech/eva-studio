import "server-only";
import crypto from "node:crypto";

// Cifra simétrica dos segredos guardados no banco (tokens de acesso da Meta /
// Instagram). AES-256-GCM: confidencialidade + autenticação (tag) num passo.
//
// Chave em TOKEN_ENCRYPTION_KEY — 32 bytes em base64 (gere com
// `openssl rand -base64 32`). SEM a env, o app ainda funciona: os valores são
// gravados em texto puro (compatível com o comportamento antigo) e um aviso é
// logado uma vez. É fortemente recomendado configurar a env em produção.
//
// Formato do valor cifrado: "enc:v1:<iv_b64>:<tag_b64>:<ct_b64>". Qualquer
// valor SEM esse prefixo é tratado como texto puro legado na leitura — então
// dá pra migrar linhas antigas sem downtime (elas passam a ser cifradas no
// próximo update).

const PREFIX = "enc:v1:";
let warnedMissingKey = false;

function getKey(): Buffer | null {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY precisa ser 32 bytes em base64 (openssl rand -base64 32).");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const key = getKey();
  if (!key) {
    if (!warnedMissingKey) {
      console.warn(
        "[crypto] TOKEN_ENCRYPTION_KEY não configurada — tokens estão sendo gravados em TEXTO PURO. Configure em produção."
      );
      warnedMissingKey = true;
    }
    return plaintext;
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(value: string | null | undefined): string {
  if (!value) return "";
  if (!value.startsWith(PREFIX)) return value; // texto puro legado
  const key = getKey();
  if (!key) {
    throw new Error("Valor cifrado encontrado mas TOKEN_ENCRYPTION_KEY não está configurada.");
  }
  const [ivB64, tagB64, ctB64] = value.slice(PREFIX.length).split(":");
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const ct = Buffer.from(ctB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
}
