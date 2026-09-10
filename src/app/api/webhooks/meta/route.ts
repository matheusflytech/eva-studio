import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { advanceConversation, type OutboundMessage } from "@/lib/server/flow-engine";
import { matchCommentAutomation } from "@/lib/server/comment-automation";

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

interface InstagramMessagingEvent {
  sender?: { id?: string };
  message?: { text?: string; is_echo?: boolean };
}

interface InstagramCommentValue {
  id?: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string };
}

async function sendMetaMessage(phoneNumberId: string, accessToken: string, to: string, message: OutboundMessage) {
  // Fora da janela de 24h, sem modelo aprovado escolhido pro bloco — a Meta
  // vai rejeitar texto livre mesmo, então nem tenta: evita gastar chamada de
  // API sabendo que vai falhar (ver docs/CHATBOT_ENGINE.md).
  if (message.requiresTemplate) return;

  const body = message.template
    ? {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: message.template.name,
          language: { code: message.template.languageCode },
          components:
            message.template.parameters.length > 0
              ? [{ type: "body", parameters: message.template.parameters.map((text) => ({ type: "text", text })) }]
              : undefined,
        },
      }
    : message.options && message.options.length > 0
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

// Instagram não tem "modelo aprovado" — fora da janela de 24h simplesmente
// não dá pra iniciar contato (ver docs/CHATBOT_ENGINE.md §6), então aqui só
// manda texto puro mesmo; requiresTemplate/template do motor não se aplicam
// (o motor só ativa essa lógica pro canal whatsapp_meta).
async function sendInstagramMessage(igBusinessId: string, accessToken: string, to: string, text: string) {
  await fetch(`https://graph.facebook.com/v21.0/${igBusinessId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ recipient: { id: to }, message: { text } }),
  });
}

// Resposta pública, visível embaixo do comentário de todo mundo (opcional).
async function sendPublicCommentReply(commentId: string, accessToken: string, text: string) {
  await fetch(`https://graph.facebook.com/v21.0/${commentId}/replies`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: text }),
  });
}

// Mensagem privada disparada a partir de um comentário (endpoint específico
// da Meta pra isso — é a única forma de iniciar uma DM sem o contato ter
// mandado mensagem antes, e só funciona nas primeiras horas depois do
// comentário). Depois de enviada, a conversa segue pelo canal "instagram"
// normal — a resposta do contato entra pelo webhook de mensagens de sempre.
async function sendPrivateCommentReply(commentId: string, accessToken: string, text: string) {
  await fetch(`https://graph.facebook.com/v21.0/${commentId}/private_replies`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: text }),
  });
}

async function handleWhatsAppEntries(entries: unknown[]) {
  for (const entry of entries as { changes?: { value?: MetaValue }[] }[]) {
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
}

// Comentário bateu com uma automação — manda a resposta pública (se tiver),
// a DM privada, registra a transcrição (pra aparecer em Conversas) e conta
// o disparo. Nota: a Meta pode reentregar o mesmo evento de webhook mais de
// uma vez; isso não é deduplicado hoje, então em teoria dá pra mandar a
// mesma DM duas vezes num reenvio raro — sem impacto prático observado.
async function handleMatchedComment(
  agentId: string,
  igBusinessId: string,
  accessToken: string,
  automationId: string,
  commentId: string,
  commenterId: string,
  commentText: string,
  publicReply: string | null,
  dmMessage: string
) {
  if (publicReply) {
    await sendPublicCommentReply(commentId, accessToken, publicReply).catch(() => {});
  }
  await sendPrivateCommentReply(commentId, accessToken, dmMessage);

  const conversation = await prisma.conversation.upsert({
    where: { agentId_channel_contactId: { agentId, channel: "instagram", contactId: commenterId } },
    create: { agentId, channel: "instagram", contactId: commenterId, variables: {} },
    update: { updatedAt: new Date() },
  });
  await prisma.message.createMany({
    data: [
      { conversationId: conversation.id, role: "contact", text: `[comentário] ${commentText}` },
      { conversationId: conversation.id, role: "bot", text: dmMessage },
    ],
  });
  await prisma.commentAutomation.update({ where: { id: automationId }, data: { triggerCount: { increment: 1 } } });
}

async function handleInstagramEntries(entries: unknown[]) {
  for (const entry of entries as {
    id?: string;
    messaging?: InstagramMessagingEvent[];
    changes?: { field?: string; value?: InstagramCommentValue }[];
  }[]) {
    const igBusinessId = entry.id;
    if (!igBusinessId) continue;

    const connection = await prisma.instagramConnection.findUnique({ where: { igBusinessId } });
    if (!connection) continue;

    for (const event of entry.messaging ?? []) {
      const from = event.sender?.id;
      const text = event.message?.text;
      if (!from || !text || event.message?.is_echo) continue;

      try {
        const result = await advanceConversation({
          agentId: connection.agentId,
          channel: "instagram",
          contactId: from,
          text,
        });
        for (const reply of result.messages) {
          await sendInstagramMessage(igBusinessId, connection.pageAccessToken, from, reply.text);
        }
      } catch {
        // Falha isolada por mensagem não deve derrubar o resto do batch.
      }
    }

    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      const comment = change.value ?? {};
      const commentId = comment.id;
      const commenterId = comment.from?.id;
      const text = comment.text;
      if (!commentId || !commenterId || !text) continue;

      try {
        const automations = await prisma.commentAutomation.findMany({ where: { agentId: connection.agentId } });
        const match = matchCommentAutomation(automations, { mediaId: comment.media?.id ?? "", text });
        if (!match) continue;

        await handleMatchedComment(
          connection.agentId,
          igBusinessId,
          connection.pageAccessToken,
          match.id,
          commentId,
          commenterId,
          text,
          match.publicReply || null,
          match.dmMessage
        );
      } catch {
        // Falha isolada por comentário não deve derrubar o resto do batch.
      }
    }
  }
}

export async function POST(request: Request) {
  // Sem credenciais de app Meta configuradas, esse canal não recebe nada de
  // verdade ainda — mas o código já fica pronto pra funcionar assim que
  // existir. Ver worker/META_SETUP.md e docs/meta-business-runbook.html.
  if (!process.env.META_APP_SECRET) {
    return NextResponse.json({ received: false, reason: "not_configured" });
  }

  const body = await request.json();
  const entries = body?.entry ?? [];

  // WhatsApp manda object: "whatsapp_business_account"; Instagram manda
  // object: "instagram" — mesmo webhook, payloads diferentes (ver §9 do
  // CHATBOT_ENGINE.md).
  if (body?.object === "instagram") {
    await handleInstagramEntries(entries);
  } else {
    await handleWhatsAppEntries(entries);
  }

  return NextResponse.json({ received: true });
}
