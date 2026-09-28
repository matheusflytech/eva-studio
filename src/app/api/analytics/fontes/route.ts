import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { coletarFontes, FONTES } from "@/lib/server/analytics";

// Tudo que o Dashboard pode mostrar, de uma vez. Um cartão novo na tela não
// gera uma ida ao servidor a mais: a página busca isto uma vez e cada cartão
// lê a chave dele.
export async function GET(request: Request) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const dias = Math.min(Math.max(Number(new URL(request.url).searchParams.get("dias")) || 30, 1), 365);

  return NextResponse.json({ dias, catalogo: FONTES, ...(await coletarFontes(orgId, dias)) });
}
