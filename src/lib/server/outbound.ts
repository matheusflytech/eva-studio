import "server-only";
import { prisma } from "@/lib/db/prisma";
import { decryptSecret } from "@/lib/server/crypto";

// ---------------------------------------------------------------------------
// Envio de saída, num lugar só.
//
// Antes disso cada rota montava a própria chamada da Graph API: a rota de
// disparos tinha o `sendMetaTemplate` dela, o webhook tinha o `sendMetaMessage`
// dele. Com sequências (drip), disparo agendado e Telegram entrando, isso
// viraria quatro cópias da mesma coisa. Aqui é o caminho único.
//
// Regra de roteamento por canal:
//   whatsapp_meta → Graph API, síncrono (a Vercel consegue chamar direto)
//   instagram     → Graph API do Instagram, síncrono
//   telegram      → Bot API, síncrono
//   whatsapp_qr   → fila (OutboundQueueItem); quem envia é o worker, porque o
//                   socket do Baileys não vive num ambiente serverless
// ---------------------------------------------------------------------------

const GRAPH = "https://graph.facebook.com/v21.0";

export interface DeliverResult {
  ok: boolean;
  /** true = foi pra fila do worker, ainda não saiu de verdade. */
  queued?: boolean;
  error?: string;
}

export async function sendWhatsAppText(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  text: string
): Promise<DeliverResult> {
  try {
    const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body: text } }),
    });
    if (!res.ok) return { ok: false, error: `Meta ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "falha de rede" };
  }
}

export async function sendWhatsAppTemplate(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  name: string,
  languageCode: string,
  parameters: string[]
): Promise<DeliverResult> {
  try {
    const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name,
          language: { code: languageCode },
          components:
            parameters.length > 0
              ? [{ type: "body", parameters: parameters.map((text) => ({ type: "text", text })) }]
              : undefined,
        },
      }),
    });
    if (!res.ok) return { ok: false, error: `Meta ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "falha de rede" };
  }
}

export async function sendInstagramText(
  igBusinessId: string,
  accessToken: string,
  to: string,
  text: string
): Promise<DeliverResult> {
  try {
    const res = await fetch(`${GRAPH}/${igBusinessId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: to }, message: { text } }),
    });
    if (!res.ok) return { ok: false, error: `Instagram ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "falha de rede" };
  }
}

export async function sendMessengerText(pageAccessToken: string, to: string, text: string): Promise<DeliverResult> {
  try {
    const res = await fetch(`${GRAPH}/me/messages?access_token=${pageAccessToken}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: to }, messaging_type: "RESPONSE", message: { text } }),
    });
    if (!res.ok) return { ok: false, error: `Messenger ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "falha de rede" };
  }
}

export async function sendTelegramText(botToken: string, chatId: string, text: string): Promise<DeliverResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) return { ok: false, error: `Telegram ${res.status}: ${await res.text()}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "falha de rede" };
  }
}

export interface DeliverInput {
  agentId: string;
  channel: string;
  /** telefone, igsid ou chat_id — o mesmo valor de Conversation.contactId. */
  to: string;
  text: string;
  /** Quando existe, whatsapp_meta manda como modelo aprovado em vez de texto. */
  template?: { name: string; languageCode: string; parameters: string[] };
  /** Rastreamento pro placar do disparo/teste A/B. */
  broadcastId?: string;
  variantId?: string;
  enrollmentId?: string;
}

/**
 * Entrega uma mensagem pro contato pelo canal certo, resolvendo a conexão do
 * agente sozinho. Devolve `queued: true` quando o envio foi delegado ao
 * worker em vez de sair na hora.
 */
export async function deliverToContact(input: DeliverInput): Promise<DeliverResult> {
  const { agentId, channel, to, text } = input;

  if (channel === "whatsapp_qr") {
    await prisma.outboundQueueItem.create({
      data: {
        agentId,
        contactId: to,
        text,
        broadcastId: input.broadcastId ?? null,
        variantId: input.variantId ?? null,
        enrollmentId: input.enrollmentId ?? null,
      },
    });
    return { ok: true, queued: true };
  }

  const result = await sendDirect(input);

  // Entrega direta não passa pela fila, então não deixaria rastro nenhum.
  // Quando o envio faz parte de uma campanha ou de uma régua, grava o mesmo
  // registro que a fila gravaria — é o que permite contar resposta por
  // variante no teste A/B e auditar quem recebeu o quê.
  if (result.ok && (input.broadcastId || input.enrollmentId)) {
    await prisma.outboundQueueItem.create({
      data: {
        agentId,
        contactId: to,
        text,
        broadcastId: input.broadcastId ?? null,
        variantId: input.variantId ?? null,
        enrollmentId: input.enrollmentId ?? null,
        status: "sent",
        sentAt: new Date(),
      },
    });
  }

  return result;
}

async function sendDirect(input: DeliverInput): Promise<DeliverResult> {
  const { agentId, channel, to, text } = input;

  if (channel === "whatsapp_meta") {
    const conn = await prisma.metaConnection.findUnique({ where: { agentId } });
    if (!conn) return { ok: false, error: "Agente sem conexão WhatsApp oficial." };
    const token = decryptSecret(conn.accessToken);
    return input.template
      ? sendWhatsAppTemplate(
          conn.phoneNumberId,
          token,
          to,
          input.template.name,
          input.template.languageCode,
          input.template.parameters
        )
      : sendWhatsAppText(conn.phoneNumberId, token, to, text);
  }

  if (channel === "instagram") {
    const conn = await prisma.instagramConnection.findUnique({ where: { agentId } });
    if (!conn) return { ok: false, error: "Agente sem conexão Instagram configurada." };
    return sendInstagramText(conn.igBusinessId, decryptSecret(conn.pageAccessToken), to, text);
  }

  if (channel === "telegram") {
    const conn = await prisma.telegramConnection.findUnique({ where: { agentId } });
    if (!conn) return { ok: false, error: "Agente sem bot do Telegram configurado." };
    return sendTelegramText(decryptSecret(conn.botToken), to, text);
  }

  if (channel === "messenger") {
    const conn = await prisma.messengerConnection.findUnique({ where: { agentId } });
    if (!conn) return { ok: false, error: "Agente sem Página do Messenger conectada." };
    return sendMessengerText(decryptSecret(conn.pageAccessToken), to, text);
  }

  if (channel === "tiktok") {
    const { sendTikTokText } = await import("@/lib/server/tiktok");
    return sendTikTokText(agentId, to, text);
  }

  return { ok: false, error: `Canal "${channel}" não envia mensagem de saída.` };
}

/**
 * Marca que o contato respondeu depois de receber uma mensagem de campanha, e
 * soma isso no placar da variante. Conta uma vez por entrega: quem responde
 * cinco vezes não vira cinco pontos pra variante A.
 *
 * Sete dias de janela: depois disso a resposta é conversa nova, não reação à
 * campanha, e contar seria inflar o número.
 */
export async function registerBroadcastReply(agentId: string, contactId: string): Promise<void> {
  const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const item = await prisma.outboundQueueItem.findFirst({
    where: {
      agentId,
      contactId,
      status: "sent",
      repliedAt: null,
      variantId: { not: null },
      sentAt: { gte: cutoff },
    },
    orderBy: { sentAt: "desc" },
  });
  if (!item?.variantId) return;

  await prisma.outboundQueueItem.update({ where: { id: item.id }, data: { repliedAt: new Date() } });
  await prisma.broadcastVariant.update({
    where: { id: item.variantId },
    data: { replyCount: { increment: 1 } },
  });
}
