import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { advanceConversation, type OutboundMessage } from "@/lib/server/flow-engine";

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

interface MetaMessage {
  from: string;
  type: string;
  text?: { body?: string };
  interactive?: {
    button_reply?: { id: string };
    list_reply?: { id: string };
  };
}

interface MetaValue {
  metadata?: { phone_number_id?: string };
  messages?: MetaMessage[];
}

async function sendMetaMessage(phoneNumberId: string, accessToken: string, to: string, message: OutboundMessage) {
  const body =
    message.options && message.options.length > 0
      ? {
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: message.text },
            action: {
              buttons: message.options.slice(0, 3).map((o) => ({ type: "reply", reply: { id: o.id, title: o.label.slice(0, 20) } })),
            },
          },
        }
      : { messaging_product: "whatsapp", to, type: "text", text: { body: message.text } };

  await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function POST(request: Request) {
  // Sem credenciais de app Meta configuradas, esse canal não recebe nada de
  // verdade ainda — mas o código já fica pronto pra funcionar assim que
  // existir. Ver worker/META_SETUP.md pros pré-requisitos.
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

      const connection = await prisma.metaConnection.findUnique({ where: { phoneNumberId } });
      if (!connection) continue;

      for (const message of value.messages) {
        const optionId = message.interactive?.button_reply?.id ?? message.interactive?.list_reply?.id;
        const text = message.text?.body;
        if (!optionId && !text) continue;

        try {
          const result = await advanceConversation({
            agentId: connection.agentId,
            channel: "whatsapp_meta",
            contactId: message.from,
            text,
            optionId,
          });
          for (const reply of result.messages) {
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
