import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { ErroApi } from "@/lib/server/api-v1/http";
import { enviarMensagemExterna } from "@/lib/server/mensagem-externa";

// POST /api/v1/messages — manda mensagem pelo agente (mesma regra da URL de
// entrada do agente: janela de 24h e modelo aprovado no WhatsApp oficial).
export const POST = rotaV1({ recurso: "messages" }, async (ctx) => {
  const c = ctx.corpo();
  const texto = (v: unknown) => (typeof v === "string" ? v : undefined);
  const agentId = texto(c.agent_id);
  if (!agentId) throw new ErroApi(400, "missing_agent", "Informe agent_id.", { param: "agent_id" });
  const r = await enviarMensagemExterna(ctx.orgId, {
    agentId,
    conversationId: texto(c.conversation_id),
    channel: texto(c.channel),
    to: texto(c.to),
    text: texto(c.text),
    templateId: texto(c.template_id),
    variables: c.variables && typeof c.variables === "object" ? (c.variables as Record<string, unknown>) : undefined,
  });
  if (!r.ok) throw new ErroApi(r.status, r.code, r.error);
  return NextResponse.json({ data: { message_id: r.messageId, conversation_id: r.conversationId, status: r.status } }, { status: 201 });
});
