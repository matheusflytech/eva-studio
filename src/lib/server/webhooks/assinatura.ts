import "server-only";
import crypto from "node:crypto";

// ---------------------------------------------------------------------------
// Assinatura Standard Webhooks (standardwebhooks.com), a mesma da Resend/Svix:
//   webhook-id, webhook-timestamp (segundos) e
//   webhook-signature: "v1,<base64 HMAC-SHA256 de `${id}.${ts}.${corpo}`>".
// O segredo é "whsec_<base64 de 24 bytes>"; a chave do HMAC é o base64
// decodificado. Quem recebe confere sobre o corpo cru e recusa timestamp com
// mais de 5 minutos de diferença (proteção contra replay).
// ---------------------------------------------------------------------------

export const TOLERANCIA_SEG = 5 * 60;

export function novoSegredo(): string {
  return `whsec_${crypto.randomBytes(24).toString("base64")}`;
}

function chaveDoSegredo(segredo: string): Buffer {
  return Buffer.from(segredo.startsWith("whsec_") ? segredo.slice(6) : segredo, "base64");
}

export function assinar(segredo: string, id: string, timestampSeg: number, corpo: string): string {
  const mac = crypto.createHmac("sha256", chaveDoSegredo(segredo)).update(`${id}.${timestampSeg}.${corpo}`).digest("base64");
  return `v1,${mac}`;
}

export function headersAssinados(segredo: string, id: string, corpo: string, agora = new Date()): Record<string, string> {
  const ts = Math.floor(agora.getTime() / 1000);
  return {
    "webhook-id": id,
    "webhook-timestamp": String(ts),
    "webhook-signature": assinar(segredo, id, ts, corpo),
  };
}

/**
 * Confere uma assinatura recebida (usado no teste e documentado para quem
 * integra). O header pode trazer várias, separadas por espaço (rotação).
 */
export function assinaturaConfere(
  segredo: string,
  headers: { id: string | null; timestamp: string | null; signature: string | null },
  corpo: string,
  agora = new Date()
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(agora.getTime() / 1000 - ts) > TOLERANCIA_SEG) return false;
  const esperada = Buffer.from(assinar(segredo, id, ts, corpo));
  return signature.split(" ").some((s) => {
    const b = Buffer.from(s);
    return b.length === esperada.length && crypto.timingSafeEqual(b, esperada);
  });
}
