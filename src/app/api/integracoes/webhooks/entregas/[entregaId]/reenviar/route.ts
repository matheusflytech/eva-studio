import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { reenviarEntrega } from "@/lib/server/webhooks/entrega";
import { respostaDoErro } from "../../../erro";

// "Reenviar": nova tentativa agora, com o mesmo webhook-id.
export async function POST(_request: Request, { params }: { params: Promise<{ entregaId: string }> }) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { entregaId } = await params;
  try {
    const r = await reenviarEntrega(ctx.orgId, entregaId);
    if (!r) return NextResponse.json({ error: "Entrega não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: r.ok, status: r.status });
  } catch (e) {
    return respostaDoErro(e);
  }
}
