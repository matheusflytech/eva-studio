import "server-only";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/server/crypto";

// Usado pelo motor de execução (flow-engine) pra pegar a chave de verdade de
// uma credencial já cadastrada — nunca exposto pra fora, só server-side.
export async function getCredentialSecret(credentialId: string): Promise<string | null> {
  if (!credentialId) return null;
  const credential = await prisma.credential.findUnique({ where: { id: credentialId } });
  if (!credential) return null;
  try {
    return decryptSecret(credential.secretEnc);
  } catch {
    return null;
  }
}
