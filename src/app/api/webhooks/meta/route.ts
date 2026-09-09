import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

// Handshake de verificação exigido pela Meta ao configurar o webhook no
// painel do app (Settings > Webhooks). Só funciona depois que
// META_WEBHOOK_VERIFY_TOKEN existir no ambiente — sem isso, essa rota
// não tem como ser ativada do lado da Meta mesmo, então não faz sentido
// simular. Ver worker/META_SETUP.md para os pré-requisitos completos.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expected = process.env.META_WEBHOOK_VERIFY_TOKEN;
  if (!expected) {
    return NextResponse.json({ error: "META_WEBHOOK_VERIFY_TOKEN não configurado." }, { status: 503 });
  }

  if (mode === "subscribe" && token === expected) {
    return new NextResponse(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "Verificação inválida." }, { status: 403 });
}

interface MetaValue {
  metadata?: { phone_number_id?: string };
  messages?: { from: string; text?: { body?: string }; type: string }[];
}

async function sendMetaMessage(phoneNumberId: string, accessToken: string, to: string, text: string) {
  await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    }),
  });
}

export async function POST(request: Request) {
  // Sem credenciais de app Meta configuradas, esse canal não recebe nada de
  // verdade ainda — mas o código já fica pronto pra funcionar assim que
  // existir. Ver [[project_eva_agent_studio]] no histórico pra o desenho
  // completo (embedded signup, criptografia de token) quando for retomar.
  if (!process.env.META_APP_SECRET) {
    return NextResponse.json({ received: false, reason: "not_configured" });
  }

  const body = await request.json();
  const entries = body?.entry ?? [];

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value: MetaValue = change.value ?? {};
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId || !value.messages) continue;

      const connection = await prisma.metaConnection.findUnique({
        where: { phoneNumberId },
        include: { agent: true },
      });
      if (!connection) continue;

      for (const message of value.messages) {
        if (message.type !== "text" || !message.text?.body) continue;

        const conversationId = `whatsapp-meta:${message.from}`;
        const agent = connection.agent;
        if (!agent.outboundUrl) continue;

        try {
          const res = await fetch(agent.outboundUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              message: message.text.body,
              conversation_id: conversationId,
              agent: {
                id: agent.id,
                name: agent.name,
                tone: agent.tone,
                language: agent.language,
                instructions: agent.instructions,
                guidelines: agent.guidelines,
              },
            }),
          });
          const data = await res.json();
          const reply = typeof data?.reply === "string" ? data.reply : null;
          if (reply) {
            await sendMetaMessage(phoneNumberId, connection.accessToken, message.from, reply);
          }
        } catch {
          // Falha isolada por mensagem não deve derrubar o resto do batch.
        }
      }
    }
  }

  return NextResponse.json({ received: true });
}
