import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { reordenarFunis } from "@/lib/server/funis-acoes";

export async function POST(request: Request) {
  const ctx = await requirePermission("funis:configurar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => ({}));
  const pedidos: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : [];
  await reordenarFunis(ctx.orgId, pedidos);
  return NextResponse.json({ ok: true });
}
