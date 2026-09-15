import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { advanceConversation } from "@/lib/server/flow-engine";
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit";

// Limites de tamanho pra não deixar entrada gigante inflar o banco / prompt.
const MAX_TEXT = 4000;
const MAX_CONTACT_ID = 128;
const MAX_OPTION_ID = 128;

// Rota pública (sem sessão) — o widget roda no site de um visitante
// qualquer, então não tem cookie de login nem X-Internal-Secret pra
// mandar. A única "chave" é o próprio agentId (igual todo widget de chat
// embutível — Intercom, Drift, etc. funcionam assim). Por isso exige
// explicitamente que o agente tenha o widget ativado (widgetEnabled), pra
// não virar um jeito de conversar de graça com QUALQUER agente só sabendo
// o id dele.
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;

  const agent = await prisma.agent.findUnique({ where: { id: agentId } });
  if (!agent || !agent.widgetEnabled) {
    return NextResponse.json({ error: "Widget não disponível." }, { status: 404, headers: CORS_HEADERS });
  }

  // Rota pública sem sessão — sem rate limit, qualquer um com o agentId (que
  // fica embutido no script.js público) poderia floodar e amplificar chamadas
  // ao webhook/IA da org. Limita por IP e por agente.
  const ip = getClientIp(request);
  const [byIp, byAgent] = await Promise.all([
    checkRateLimit(`widget:${agentId}:${ip}`, 20, 60), // 20/min por IP+agente
    checkRateLimit(`widget:${agentId}`, 600, 60), // 600/min por agente (teto global)
  ]);
  if (!byIp.allowed || !byAgent.allowed) {
    return NextResponse.json({ error: "Muitas mensagens. Aguarde um instante." }, { status: 429, headers: CORS_HEADERS });
  }

  const { contactId, text, optionId, lang } = await request.json();
  if (!contactId || typeof contactId !== "string" || contactId.length > MAX_CONTACT_ID) {
    return NextResponse.json({ error: "contactId inválido." }, { status: 400, headers: CORS_HEADERS });
  }
  if (text !== undefined && (typeof text !== "string" || text.length > MAX_TEXT)) {
    return NextResponse.json({ error: "Mensagem muito longa." }, { status: 400, headers: CORS_HEADERS });
  }
  if (optionId !== undefined && (typeof optionId !== "string" || optionId.length > MAX_OPTION_ID)) {
    return NextResponse.json({ error: "optionId inválido." }, { status: 400, headers: CORS_HEADERS });
  }
  const safeLang = typeof lang === "string" ? lang.slice(0, 8) : undefined;

  const result = await advanceConversation({ agentId, channel: "website", contactId, text, optionId, lang: safeLang });
  return NextResponse.json(result, { headers: CORS_HEADERS });
}
