import { NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { conferirEntrada } from "@/lib/server/webhooks/entrada-do-agente";
import { registrarTrocaExterna } from "@/lib/server/conversa-externa";

// ---------------------------------------------------------------------------
// Conversa de site externo (IA própria, ex.: chat do Drawing Club) gravada no
// agente. Cada chamada é uma troca:
//   POST { "conversation_id": "web_abc", "message": "...", "reply": "...",
//          "lang": "pt", "page": "https://..." }
// O token na URL é a credencial (mesma URL de entrada do agente, + /conversa).
// ---------------------------------------------------------------------------

const POR_MINUTO = 300;

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string; token: string }> }) {
  const { agentId, token } = await params;
  const entrada = await conferirEntrada(agentId, token);
  if (!entrada) return NextResponse.json({ error: { code: "invalid_url", message: "URL de entrada inválida ou trocada." } }, { status: 401 });

  const limite = await checkRateLimit(`hook-conversa:${agentId}`, POR_MINUTO, 60);
  if (!limite.allowed) {
    return NextResponse.json({ error: { code: "rate_limited", message: "Muitas mensagens em pouco tempo." } }, { status: 429, headers: { "Retry-After": String(limite.resetSec ?? 60) } });
  }

  const c = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!c || typeof c !== "object") return NextResponse.json({ error: { code: "invalid_json", message: "Envie um objeto JSON." } }, { status: 400 });
  const txt = (v: unknown) => (typeof v === "string" ? v : undefined);
  const r = await registrarTrocaExterna(entrada.orgId, agentId, {
    conversationId: txt(c.conversation_id) ?? "",
    message: txt(c.message) ?? "",
    reply: txt(c.reply) ?? "",
    lang: txt(c.lang),
    pagina: txt(c.page),
    nome: txt(c.name),
  });
  if (!r.ok) return NextResponse.json({ error: { code: "invalid_request", message: r.error } }, { status: r.status });
  return NextResponse.json({ data: { conversation_id: r.conversaId, lead: r.lead, contact_id: r.contatoId } });
}
