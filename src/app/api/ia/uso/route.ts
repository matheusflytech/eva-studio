import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { resumoDoMes } from "@/lib/server/ia/uso";

// Consumo de IA do mês (horário de Brasília) por chave e por agente, com
// limite e custo estimado. Só números: nenhuma chave sai daqui.
export async function GET() {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  return NextResponse.json(await resumoDoMes(ctx.orgId));
}
