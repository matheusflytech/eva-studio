import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { advanceConversation } from "@/lib/server/flow-engine";
import { checkRateLimit, getClientIp } from "@/lib/server/rate-limit";
import { transcreverAudio } from "@/lib/server/transcribe";

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

  const body = await request.json();
  const { optionId, lang } = body;
  let { text } = body;
  // O site antigo mandava `conversation_id`; aceita os dois nomes.
  const contactId = body.contactId ?? body.conversation_id;

  // Áudio: transcreve e segue como se o visitante tivesse digitado.
  let transcricao: string | undefined;
  if (typeof body.audio_base64 === "string") {
    const mime = typeof body.audio_mime === "string" ? body.audio_mime.slice(0, 40) : "audio/webm";
    const r = await transcreverAudio(agent.orgId, body.audio_base64, mime, typeof lang === "string" ? lang : undefined);
    if ("erro" in r) {
      const msg =
        r.erro === "sem_chave"
          ? "O atendimento por voz ainda não está configurado. Pode escrever sua mensagem?"
          : r.erro === "vazio"
            ? "Não consegui ouvir nada nesse áudio. Tente de novo ou escreva."
            : "Não consegui entender o áudio agora. Pode escrever sua mensagem?";
      return NextResponse.json({ messages: [{ text: msg }], status: "active" }, { headers: CORS_HEADERS });
    }
    text = r.texto.slice(0, MAX_TEXT);
    transcricao = text;
  }

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
  return NextResponse.json(transcricao ? { ...result, transcricao } : result, { headers: CORS_HEADERS });
}
