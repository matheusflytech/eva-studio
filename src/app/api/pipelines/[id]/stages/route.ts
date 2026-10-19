import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { ErroDeFunil, criarEtapa } from "@/lib/server/funis-acoes";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  try {
    const etapa = await criarEtapa(ctx.orgId, id, body ?? {});
    return NextResponse.json({ stage: etapa });
  } catch (e) {
    if (e instanceof ErroDeFunil) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
