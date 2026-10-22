import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { ErroDeFunil, reordenarEtapas } from "@/lib/server/funis-acoes";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("funis:configurar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  const pedidas: string[] = Array.isArray(body?.ids) ? body.ids.map(String) : [];
  try {
    await reordenarEtapas(ctx.orgId, id, pedidas);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ErroDeFunil) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
