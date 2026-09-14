import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { advanceConversation } from "@/lib/server/flow-engine";

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

  const { contactId, text, optionId } = await request.json();
  if (!contactId) {
    return NextResponse.json({ error: "contactId é obrigatório." }, { status: 400, headers: CORS_HEADERS });
  }

  const result = await advanceConversation({ agentId, channel: "website", contactId, text, optionId });
  return NextResponse.json(result, { headers: CORS_HEADERS });
}
