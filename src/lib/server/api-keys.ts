import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

// Chave pública de API — mesmo modelo que Stripe/OpenAI/HubSpot usam:
// "evs_live_<32 bytes em hex>", só o SHA-256 vai pro banco, a chave completa
// só existe uma vez (no momento da criação) e nunca mais é recuperável.

const PREFIX = "evs_live_";

function hashKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function generateApiKey(): { key: string; keyPrefix: string; keyHash: string } {
  const key = `${PREFIX}${randomBytes(24).toString("hex")}`;
  return { key, keyPrefix: key.slice(0, PREFIX.length + 8), keyHash: hashKey(key) };
}

// Usado pelas rotas públicas /api/v1/* — devolve o orgId dono da chave, ou
// null se a chave for inválida/revogada. Atualiza lastUsedAt em segundo
// plano (não espera, não deve atrasar a resposta por causa disso).
export async function requireApiKeyOrgId(request: Request): Promise<string | null> {
  const auth = request.headers.get("authorization");
  const key = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  if (!key || !key.startsWith(PREFIX)) return null;

  const row = await prisma.apiKey.findFirst({ where: { keyHash: hashKey(key), revokedAt: null } });
  if (!row) return null;

  prisma.apiKey.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  return row.orgId;
}
