import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { desconectarCanal } from "@/lib/server/canais/conectar";

// Desconecta o canal do contrato (e tira do agente que atendia por ele).
export async function DELETE(_request: Request, { params }: { params: Promise<{ canalId: string }> }) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { canalId } = await params;
  const r = await desconectarCanal(ctx.orgId, canalId);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true });
}
