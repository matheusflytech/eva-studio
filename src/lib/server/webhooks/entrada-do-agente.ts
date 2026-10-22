import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret, encryptSecret } from "@/lib/server/crypto";
import { timingSafeEqualStr } from "@/lib/server/secure-compare";

// ---------------------------------------------------------------------------
// URL de entrada do agente: /api/hooks/agentes/{agentId}/{token}. O token na
// URL é a credencial (como a "Production URL" do próprio n8n): quem tem a
// URL manda mensagem pelo agente. Por isso dá para trocar a qualquer hora.
// ---------------------------------------------------------------------------

export const caminhoDaEntrada = (agentId: string, token: string) => `/api/hooks/agentes/${agentId}/${token}`;

const novoToken = () => `evh_${crypto.randomBytes(24).toString("hex")}`;

/** Token atual (null = ainda não gerado). Lança se a tabela não existe. */
export async function tokenDaEntrada(orgId: string, agentId: string): Promise<string | null> {
  const e = await prisma.agenteEntrada.findFirst({ where: { agentId, orgId } });
  return e ? decryptSecret(e.token) : null;
}

/** Gera (ou troca) o token. A URL antiga para de funcionar na hora. */
export async function gerarTokenDaEntrada(orgId: string, agentId: string): Promise<string> {
  const token = novoToken();
  await prisma.agenteEntrada.upsert({
    where: { agentId },
    create: { agentId, orgId, token: encryptSecret(token) },
    update: { token: encryptSecret(token), orgId },
  });
  return token;
}

export async function desligarEntrada(orgId: string, agentId: string): Promise<void> {
  await prisma.agenteEntrada.deleteMany({ where: { agentId, orgId } });
}

/** Confere o token da URL. Devolve o contrato do agente, ou null. */
export async function conferirEntrada(agentId: string, token: string): Promise<{ orgId: string } | null> {
  if (!token.startsWith("evh_")) return null;
  const e = await prisma.agenteEntrada.findUnique({ where: { agentId } }).catch(() => null);
  if (!e) return null;
  return timingSafeEqualStr(decryptSecret(e.token), token) ? { orgId: e.orgId } : null;
}
