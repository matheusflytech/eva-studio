import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { lerCanaisDoContrato } from "@/lib/server/canais/repositorio";

// Canais do contrato e quem atende cada um (Configurações → Canais e a aba
// Canais do agente). Sem segredos.
export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  return NextResponse.json(await lerCanaisDoContrato(ctx.orgId));
}
