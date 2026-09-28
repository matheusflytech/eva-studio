import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { advanceConversation } from "@/lib/server/flow-engine";
import { sendTikTokText } from "@/lib/server/tiktok";
import { timingSafeEqualStr } from "@/lib/server/secure-compare";

// ---------------------------------------------------------------------------
// Webhook do TikTok Business Messaging.
//
// Um por agente (a URL carrega o agentId), como no Telegram — cada conta
// TikTok pertence a um agente só, então não há por que descobrir pelo payload.
//
// O identificador de conversa do TikTok é `conversation_id`, não um id de
// usuário: é ele que volta no envio. Por isso ele é o contactId aqui.
// ---------------------------------------------------------------------------

interface TikTokEvent {
  event?: string;
  conversation_id?: string;
  message?: { type?: string; text?: string; content?: string };
  text?: string;
  sender?: { id?: string; nickname?: string };
}

interface TikTokWebhookBody {
  event?: string;
  data?: TikTokEvent;
  events?: TikTokEvent[];
}

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;

  const conn = await prisma.tikTokConnection.findUnique({ where: { agentId } });
  // Sempre 200 quando não há o que fazer: webhook que devolve erro entra em
  // repetição do outro lado sem nunca ter chance de dar certo.
  if (!conn) return NextResponse.json({ ok: true });

  // O TikTok não assina o corpo como a Meta. A checagem possível é um segredo
  // compartilhado na querystring, configurado junto com o callback no portal.
  const expected = process.env.INTERNAL_API_SECRET;
  if (expected) {
    const token = new URL(request.url).searchParams.get("token");
    if (!timingSafeEqualStr(token, expected)) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
  }

  const body = (await request.json().catch(() => null)) as TikTokWebhookBody | null;
  if (!body) return NextResponse.json({ ok: true });

  // O formato varia entre um evento só (`data`) e um lote (`events`).
  const events: TikTokEvent[] = body.events ?? (body.data ? [body.data] : []);

  for (const event of events) {
    const conversationId = event.conversation_id;
    // Só mensagem de entrada interessa: evento de "entregue"/"visto" não
    // deve empurrar a conversa pra frente.
    const text = event.message?.text ?? event.message?.content ?? event.text;
    if (!conversationId || !text) continue;

    const result = await advanceConversation({
      agentId,
      channel: "tiktok",
      contactId: conversationId,
      text,
    });

    for (const message of result.messages) {
      const sent = await sendTikTokText(agentId, conversationId, message.text);
      if (!sent.ok) {
        await prisma.tikTokConnection.update({
          where: { agentId },
          data: { lastError: sent.error ?? null },
        });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

// O TikTok valida o callback com um GET de eco, mesmo padrão da Meta.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const challenge = searchParams.get("challenge") ?? searchParams.get("hub.challenge");
  return challenge ? new Response(challenge, { status: 200 }) : NextResponse.json({ ok: true });
}
