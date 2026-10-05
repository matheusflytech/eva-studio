import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { reenviarMensagem } from "@/lib/server/responder";

// Tenta de novo uma mensagem que falhou no envio.
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string; messageId: string }> }
) {
  const ctx = await requirePermission("conversations:reply");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id, messageId } = await params;

  const resultado = await reenviarMensagem({ messageId, conversationId: id, orgId: ctx.orgId });
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.error, codigo: resultado.codigo }, { status: resultado.status });
  }
  return NextResponse.json({ ok: true, message: resultado.message });
}
