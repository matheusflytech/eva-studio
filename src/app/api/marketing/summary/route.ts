import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { marketingSummary } from "@/lib/server/marketing";
import { janelaDoPainel } from "@/lib/consulta";

// Resumo da aba Marketing: investimento, leads, negócios, vendas, receita,
// CPL, CAC, ROAS e % com origem, no total e por fonte/campanha.
export async function GET(request: Request) {
  const ctx = await requirePermission("marketing:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const q = new URL(request.url).searchParams;
  const j = janelaDoPainel(Number(q.get("days")) || 30, q.get("from") ?? undefined, q.get("to") ?? undefined);
  return NextResponse.json(await marketingSummary(ctx.orgId, j.de, j.ate));
}
