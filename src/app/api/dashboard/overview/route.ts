import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { sanearFiltrosGlobais } from "@/lib/consulta";
import { coletarVisaoGeral, GRUPOS_DE_CANAL } from "@/lib/server/dashboard-overview";

// Cartões da visão geral do Dashboard: o período da barra contra o período
// anterior de mesmo tamanho. GET ?dias= ou ?de=&ate=, &funis=, &donos= (os
// mesmos de /api/analytics/fontes) e &channel=whatsapp|website|instagram|messenger|telegram (vazio = todos).
export async function GET(request: Request) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const params = new URL(request.url).searchParams;
  const canal = params.get("channel") ?? "";
  return NextResponse.json(await coletarVisaoGeral(orgId, canal in GRUPOS_DE_CANAL ? canal : "", sanearFiltrosGlobais(params)));
}
