import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { conferirEntrada } from "@/lib/server/webhooks/entrada-do-agente";
import { enviarMensagemExterna } from "@/lib/server/mensagem-externa";

// ---------------------------------------------------------------------------
// URL de entrada do agente. O fluxo do cliente (n8n) manda mensagem pelo
// agente, por exemplo para responder depois o que chegou pelo bloco "Enviar
// para o n8n":
//   POST { "conversation_id": "whatsapp_qr:5511...", "text": "..." }
//   ou   { "channel": "whatsapp_meta", "to": "5511...", "template_id": "...", "variables": {...} }
// O token na URL é a credencial; Integrações não é preciso.
// ---------------------------------------------------------------------------

const POR_MINUTO = 120;

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string; token: string }> }) {
  const { agentId, token } = await params;
  const entrada = await conferirEntrada(agentId, token);
  if (!entrada) return NextResponse.json({ error: { code: "invalid_url", message: "URL de entrada inválida ou trocada." } }, { status: 401 });

  const limite = await checkRateLimit(`hook-agente:${agentId}`, POR_MINUTO, 60);
  if (!limite.allowed) {
    return NextResponse.json(
      { error: { code: "rate_limited", message: "Muitas mensagens em pouco tempo. Tente de novo em instantes." } },
      { status: 429, headers: { "Retry-After": String(limite.resetSec ?? 60) } }
    );
  }

  const corpo = await request.json().catch(() => null);
  if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) {
    return NextResponse.json({ error: { code: "invalid_json", message: "Envie um objeto JSON." } }, { status: 400 });
  }
  const c = corpo as Record<string, unknown>;
  const r = await enviarMensagemExterna(entrada.orgId, {
    agentId,
    conversationId: typeof c.conversation_id === "string" ? c.conversation_id : undefined,
    channel: typeof c.channel === "string" ? c.channel : undefined,
    to: typeof c.to === "string" ? c.to : undefined,
    text: typeof c.text === "string" ? c.text : typeof c.reply === "string" ? c.reply : undefined,
    templateId: typeof c.template_id === "string" ? c.template_id : undefined,
    variables: c.variables && typeof c.variables === "object" ? (c.variables as Record<string, unknown>) : undefined,
  });
  if (!r.ok) return NextResponse.json({ error: { code: r.code, message: r.error } }, { status: r.status });
  return NextResponse.json({ data: { message_id: r.messageId, conversation_id: r.conversationId, status: r.status } });
}
