import "server-only";
import crypto from "node:crypto";

// Verifica a assinatura X-Hub-Signature-256 que a Meta manda em TODO POST de
// webhook (HMAC-SHA256 do corpo cru usando o App Secret). Sem isso, qualquer
// um poderia forjar eventos e fazer o bot responder / registrar conversas
// falsas usando os tokens de acesso guardados. Ver:
// https://developers.facebook.com/docs/messenger-platform/webhooks#validate-payloads
export function verifyMetaSignature(rawBody: string, signatureHeader: string | null): boolean {
  const appSecret = process.env.META_APP_SECRET;
  if (!appSecret) return false;
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
