import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { ErroDeFunil, apagarEtapa, atualizarEtapa } from "@/lib/server/funis-acoes";

function respostaDoErro(e: unknown) {
  if (e instanceof ErroDeFunil) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
  throw e;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; stageId: string }> }) {
  const ctx = await requirePermission("funis:configurar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id, stageId } = await params;

  const body = await request.json().catch(() => ({}));
  try {
    await atualizarEtapa(ctx.orgId, id, stageId, body ?? {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDoErro(e);
  }
}

// Apagar etapa com negócios exige ?moverPara=etapaId (do mesmo funil).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; stageId: string }> }) {
  const ctx = await requirePermission("funis:configurar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id, stageId } = await params;

  try {
    const r = await apagarEtapa(ctx.orgId, id, stageId, new URL(request.url).searchParams.get("moverPara"));
    return NextResponse.json({ ok: true, movidos: r.movidos });
  } catch (e) {
    return respostaDoErro(e);
  }
}
