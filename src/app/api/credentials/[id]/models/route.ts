import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/server/crypto";
import { LLM_PROVIDERS } from "@/lib/llm-providers";
import { listarModelosDaChave } from "@/lib/server/ia/modelos-da-chave";

// Modelos que a chave desta credencial enxerga no provedor. Usado pelo bloco
// de IA do Builder para oferecer o que a conta do cliente tem de verdade
// (inclusive modelo lançado depois do catálogo fixo). A chave não sai daqui.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;

  const credential = await prisma.credential.findFirst({ where: { id, orgId }, select: { type: true, secretEnc: true } });
  if (!credential) return NextResponse.json({ error: "Credencial não encontrada." }, { status: 404 });

  const provedor = LLM_PROVIDERS.find((p) => p.credentialType === credential.type);
  if (!provedor) return NextResponse.json({ error: "Essa credencial não é de um provedor de IA." }, { status: 400 });

  let apiKey: string;
  try {
    apiKey = decryptSecret(credential.secretEnc);
  } catch {
    return NextResponse.json({ error: "Não deu para ler essa credencial. Cadastre a chave de novo." }, { status: 422 });
  }

  const { modelos, erro } = await listarModelosDaChave(provedor.id, apiKey);
  return NextResponse.json({ modelos, ...(erro ? { erro } : {}) });
}
