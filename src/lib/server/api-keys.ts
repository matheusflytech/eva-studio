import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { comFallbackLegado } from "@/lib/server/contratos";

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

/**
 * Chave não revogada e não vencida. `expiresAt` é coluna do SQL de contratos:
 * antes dele, a busca cai no select antigo (nenhuma chave vence).
 */
async function buscarChaveValida(
  keyHash: string,
  select: { id: true; orgId: true; scopes?: true }
): Promise<{ id: string; orgId: string; scopes?: string[] } | null> {
  const where = { keyHash, revokedAt: null };
  const row: { id: string; orgId: string; scopes?: string[]; expiresAt?: Date | null } | null = await comFallbackLegado(
    () => prisma.apiKey.findFirst({ where, select: { ...select, expiresAt: true } }),
    () => prisma.apiKey.findFirst({ where, select })
  );
  if (!row) return null;
  if (row.expiresAt instanceof Date && row.expiresAt.getTime() <= Date.now()) return null;
  return row;
}

function chaveDoHeader(request: Request): string | null {
  const auth = request.headers.get("authorization");
  const key = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : null;
  return key && key.startsWith(PREFIX) ? key : null;
}

function marcarUso(id: string) {
  prisma.apiKey.update({ where: { id }, data: { lastUsedAt: new Date() }, select: { id: true } }).catch(() => {});
}

export interface ChaveAutenticada {
  orgId: string;
  keyId: string;
  scopes: string[];
}

/**
 * Rotas públicas /api/v1/*: org, id e escopos da chave, ou null se inválida,
 * revogada ou vencida. lastUsedAt é gravado em segundo plano.
 */
export async function autenticarChave(request: Request): Promise<ChaveAutenticada | null> {
  const key = chaveDoHeader(request);
  if (!key) return null;
  const row = await buscarChaveValida(hashKey(key), { id: true, orgId: true, scopes: true });
  if (!row) return null;
  marcarUso(row.id);
  return { orgId: row.orgId, keyId: row.id, scopes: row.scopes?.length ? row.scopes : ["*"] };
}
