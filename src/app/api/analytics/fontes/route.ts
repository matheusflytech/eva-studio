import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { coletarFontes, FONTES } from "@/lib/server/analytics";
import { sanearFiltrosGlobais } from "@/lib/consulta";

// Tudo que o Dashboard pode mostrar, de uma vez. Um cartão novo na tela não
// gera uma ida ao servidor a mais: a página busca isto uma vez e cada cartão
// lê a chave dele. Os filtros globais da barra vêm na query string
// (?dias= ou ?de=&ate=, &funis=a,b, &donos=x,y).
export async function GET(request: Request) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const globais = sanearFiltrosGlobais(new URL(request.url).searchParams);

  return NextResponse.json({ dias: globais.dias, catalogo: FONTES, ...(await coletarFontes(orgId, globais)) });
}
