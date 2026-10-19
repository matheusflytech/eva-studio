import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { ErroDeFunil, apagarFunil, atualizarFunil } from "@/lib/server/funis-acoes";

function respostaDoErro(e: unknown) {
  if (e instanceof ErroDeFunil) return NextResponse.json({ error: e.message, ...e.extra }, { status: e.status });
  throw e;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("funis:configurar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const body = await request.json().catch(() => ({}));
  try {
    await atualizarFunil(ctx.orgId, id, { name: body?.name, isDefault: body?.isDefault });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDoErro(e);
  }
}

// Apagar um funil com negócios exige dizer pra onde eles vão (?moverPara=funilId).
// Cada negócio cai na etapa de mesmo nome do funil de destino, ou na de mesmo
// tipo (ganho/perdido), ou na primeira etapa aberta.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("funis:configurar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  try {
    const r = await apagarFunil(ctx.orgId, id, new URL(request.url).searchParams.get("moverPara"));
    return NextResponse.json({ ok: true, movidos: r.movidos });
  } catch (e) {
    return respostaDoErro(e);
  }
}
