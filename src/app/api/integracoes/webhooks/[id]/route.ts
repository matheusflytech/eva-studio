import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { apagarEndpoint, atualizarEndpoint, serializarEndpoint } from "@/lib/server/webhooks/endpoints";
import { respostaDoErro } from "../erro";

type P = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: P) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  try {
    const e = await atualizarEndpoint(ctx.orgId, id, { url: body?.url, eventos: body?.events, descricao: body?.description, ativo: body?.active });
    return NextResponse.json({ webhook: serializarEndpoint(e) });
  } catch (e) {
    return respostaDoErro(e);
  }
}

export async function DELETE(_request: Request, { params }: P) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  try {
    if (!(await apagarEndpoint(ctx.orgId, id))) return NextResponse.json({ error: "Webhook não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return respostaDoErro(e);
  }
}
