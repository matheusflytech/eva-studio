import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { coletarVisaoGeral, GRUPOS_DE_CANAL } from "@/lib/server/dashboard-overview";

// Visão geral do Dashboard: o mês até hoje contra os mesmos dias do mês
// anterior. GET ?channel=whatsapp|website|instagram|messenger|telegram (vazio = todos).
export async function GET(request: Request) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const canal = new URL(request.url).searchParams.get("channel") ?? "";
  return NextResponse.json(await coletarVisaoGeral(orgId, canal in GRUPOS_DE_CANAL ? canal : ""));
}
