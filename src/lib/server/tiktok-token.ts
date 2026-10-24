import "server-only";
import crypto from "node:crypto";
import { timingSafeEqualStr } from "@/lib/server/secure-compare";

// Token da URL do webhook do TikTok (o TikTok não assina o corpo; a URL é a
// única prova de origem). Um por agente ou canal: HMAC do escopo com o segredo
// interno. Quem vê a URL na tela fala só com aquele webhook, e o segredo
// interno, que abre as rotas internas de todos os contratos, nunca sai do servidor.

/** Escopo do token: `agente:<id>` ou `canal:<id>`. null sem segredo configurado. */
export function tokenDoWebhookTikTok(escopo: string): string | null {
  const segredo = process.env.INTERNAL_API_SECRET;
  if (!segredo) return null;
  return crypto.createHmac("sha256", segredo).update(`tiktok:${escopo}`).digest("base64url");
}

/** Sem segredo configurado (dev local), não há o que conferir, como antes. */
export function tokenDoWebhookTikTokConfere(escopo: string, recebido: string | null): boolean {
  const esperado = tokenDoWebhookTikTok(escopo);
  return !esperado || timingSafeEqualStr(recebido, esperado);
}
