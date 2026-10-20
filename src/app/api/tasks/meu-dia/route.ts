import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { carregarMeuDia } from "@/lib/server/meu-dia";

// GET /api/tasks/meu-dia — o dia da pessoa logada: fixos, ranking, capacidade,
// excedente "provavelmente amanhã", filas por tipo e o resumo do dia.
export async function GET() {
  const ctx = await requirePermission("tarefas:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  return NextResponse.json(await carregarMeuDia(ctx));
}
