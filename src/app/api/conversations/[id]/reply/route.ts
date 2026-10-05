import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { responderComoAtendente } from "@/lib/server/responder";

// Resposta de um atendente. Toda a regra mora em lib/server/responder.ts, que
// a rota de reenvio também usa.
//
// POST { text?, templateId?, attachment? }
//
// Responder numa conversa que o agente ainda atende ASSUME a conversa: não
// existe "responder sem assumir", porque o agente e a pessoa falariam juntos.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("conversations:reply");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const body = await request.json().catch(() => ({}));

  const resultado = await responderComoAtendente({
    conversationId: id,
    orgId: ctx.orgId,
    userId: ctx.userId,
    text: typeof body.text === "string" ? body.text : undefined,
    templateId: typeof body.templateId === "string" ? body.templateId : undefined,
    attachment: body.attachment && typeof body.attachment === "object" ? body.attachment : undefined,
  });

  if (!resultado.ok) {
    return NextResponse.json(
      { error: resultado.error, codigo: resultado.codigo, ...resultado.extra },
      { status: resultado.status }
    );
  }
  return NextResponse.json({ ok: true, message: resultado.message });
}
