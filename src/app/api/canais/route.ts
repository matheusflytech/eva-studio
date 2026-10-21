import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { listarCanais } from "@/lib/server/canais-do-contrato";

// Todos os canais conectados no contrato e quem atende cada um
// (Configurações → Canais e a aba Canais do agente). Sem segredos.
export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  return NextResponse.json(await listarCanais(ctx.orgId));
}
