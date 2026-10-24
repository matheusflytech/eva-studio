import "server-only";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/server/crypto";

// Usado pelo motor de execução (flow-engine) pra pegar a chave de verdade de
// uma credencial já cadastrada — nunca exposto pra fora, só server-side.
// Sempre pela org: um id de outro contrato salvo num bloco não vira a chave dele.
export async function getCredentialSecret(orgId: string, credentialId: string): Promise<string | null> {
  if (!credentialId) return null;
  const credential = await prisma.credential.findFirst({ where: { id: credentialId, orgId } });
  if (!credential) return null;
  try {
    return decryptSecret(credential.secretEnc);
  } catch {
    return null;
  }
}
