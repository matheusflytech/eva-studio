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
//   messenger     → Graph API da Página, síncrono
//   telegram      → Bot API, síncrono
//   tiktok        → API do TikTok, só texto
//   whatsapp_qr   → fila (OutboundQueueItem); quem envia é o worker, porque o
//                   socket do Baileys não vive num ambiente serverless
// ---------------------------------------------------------------------------

const GRAPH = "https://graph.facebook.com/v21.0";

export interface DeliverResult {
  ok: boolean;
  /** true = foi pra fila do worker, ainda não saiu de verdade. */
  queued?: boolean;
  error?: string;
  /** Id do lado de fora (wamid, message_id) ou do item da fila: é o que o recibo de entrega usa pra achar a mensagem. */
  id?: string;
}

export interface AnexoDeSaida {
  /** URL temporária assinada, pros canais que buscam o arquivo sozinhos. */
  url?: string;
  /** Caminho no storage, pro worker do QR (que pede a URL ao app). */
  path: string;
  type: string;
  mime: string;
  name?: string;
}

// ---------------------------------------------------------------------------
// Erros em português
//
// A Meta responde com JSON e códigos numéricos. Mostrar isso cru pro atendente
// ("Meta 400: {"error":{"code":131047...") não diz o que fazer. Os códigos
// abaixo são os que aparecem de verdade no dia a dia de um atendimento.
// ---------------------------------------------------------------------------

async function erroLegivel(origem: string, res: Response): Promise<string> {
  let corpo = "";
  try {
    corpo = await res.text();
  } catch {
    return `${origem} respondeu ${res.status}.`;
  }

  try {
    const json = JSON.parse(corpo) as {
      error?: { message?: string; code?: number; error_subcode?: number; error_data?: { details?: string } };
      description?: string;
    };

    const codigo = json.error?.code;
    const sub = json.error?.error_subcode;
    if (codigo === 131047 || codigo === 131051 || sub === 2534022 || sub === 2018278) {
      return "A janela de 24h desta conversa acabou. Só dá para enviar um modelo aprovado pela Meta.";
    }
    if (codigo === 131026) return "O número não recebeu: pode não ter WhatsApp, ou ter bloqueado esta conta.";
    if (codigo === 131030) return "Número fora da lista de teste da Meta. Em modo de teste só números cadastrados recebem.";
    if (codigo === 130429 || codigo === 131056) return "A Meta limitou os envios por agora. Tente de novo em instantes.";
    if (codigo === 190 || codigo === 102) return "O acesso à Meta expirou ou foi revogado. Reconecte o canal na aba do agente.";
    if (codigo === 132000 || codigo === 132001 || codigo === 132005 || codigo === 132012) {
      return "O modelo de mensagem não existe, não está aprovado ou os campos não batem. Confira em Aprovações.";
    }

    const detalhe = json.error?.error_data?.details ?? json.error?.message ?? json.description;
    if (detalhe) return `${origem}: ${detalhe}`.slice(0, 300);
  } catch {
    // não era JSON: cai no texto cru, curto
  }
  return `${origem} respondeu ${res.status}${corpo ? `: ${corpo.slice(0, 160)}` : "."}`;
}

async function lerId(res: Response, caminho: "wa" | "ig" | "tg"): Promise<string | undefined> {
  try {
    const json = (await res.json()) as {
      messages?: { id?: string }[];
      message_id?: string;
      result?: { message_id?: number };
    };
    if (caminho === "wa") return json.messages?.[0]?.id;
    if (caminho === "ig") return json.message_id;
    return json.result?.message_id !== undefined ? String(json.result.message_id) : undefined;
  } catch {
    return undefined;
  }
}

const falhaDeRede = (e: unknown): DeliverResult => ({
  ok: false,
  error: e instanceof Error ? `Falha de rede: ${e.message}` : "Falha de rede.",
});

// ---------------------------------------------------------------------------
// WhatsApp (Cloud API)
// ---------------------------------------------------------------------------

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
    if (!res.ok) return { ok: false, error: await erroLegivel("Meta", res) };
    return { ok: true, id: await lerId(res, "wa") };
  } catch (e) {
    return falhaDeRede(e);
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
    if (!res.ok) return { ok: false, error: await erroLegivel("Meta", res) };
    return { ok: true, id: await lerId(res, "wa") };
  } catch (e) {
    return falhaDeRede(e);
  }
}

/** Foto, áudio, vídeo, documento ou figurinha. A Meta busca o arquivo pela URL. */
export async function sendWhatsAppMedia(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  anexo: AnexoDeSaida,
  legenda: string
): Promise<DeliverResult> {
  if (!anexo.url) return { ok: false, error: "Não foi possível gerar o link do arquivo." };
  const tipo = anexo.type === "sticker" ? "sticker" : anexo.type;
  // Áudio e figurinha não aceitam legenda; documento leva nome de arquivo.
  const corpo: Record<string, unknown> = { link: anexo.url };
  if (legenda && (tipo === "image" || tipo === "video" || tipo === "document")) corpo.caption = legenda;
  if (tipo === "document") corpo.filename = anexo.name ?? "arquivo";

  try {
    const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: tipo, [tipo]: corpo }),
    });
    if (!res.ok) return { ok: false, error: await erroLegivel("Meta", res) };
    const id = await lerId(res, "wa");

    // Áudio não carrega legenda: o texto, se houver, vai em mensagem separada.
    if (legenda && (tipo === "audio" || tipo === "sticker")) {
      await sendWhatsAppText(phoneNumberId, accessToken, to, legenda);
    }
    return { ok: true, id };
  } catch (e) {
    return falhaDeRede(e);
  }
}

// ---------------------------------------------------------------------------
// Instagram e Messenger
// ---------------------------------------------------------------------------

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
    if (!res.ok) return { ok: false, error: await erroLegivel("Instagram", res) };
    return { ok: true, id: await lerId(res, "ig") };
  } catch (e) {
    return falhaDeRede(e);
  }
}

function tipoSocial(tipo: string): "image" | "audio" | "video" | "file" {
  if (tipo === "image" || tipo === "sticker") return "image";
  if (tipo === "audio") return "audio";
  if (tipo === "video") return "video";
  return "file";
}

export async function sendInstagramMedia(
  igBusinessId: string,
  accessToken: string,
  to: string,
  anexo: AnexoDeSaida,
  legenda: string
): Promise<DeliverResult> {
  if (!anexo.url) return { ok: false, error: "Não foi possível gerar o link do arquivo." };
  try {
    const res = await fetch(`${GRAPH}/${igBusinessId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: to },
        message: { attachment: { type: tipoSocial(anexo.type), payload: { url: anexo.url } } },
      }),
    });
    if (!res.ok) return { ok: false, error: await erroLegivel("Instagram", res) };
    const id = await lerId(res, "ig");
    if (legenda) await sendInstagramText(igBusinessId, accessToken, to, legenda);
    return { ok: true, id };
  } catch (e) {
    return falhaDeRede(e);
  }
}

export async function sendMessengerText(pageAccessToken: string, to: string, text: string): Promise<DeliverResult> {
  try {
    const res = await fetch(`${GRAPH}/me/messages`, {
      method: "POST",
      // Token no cabeçalho, não na URL: URL vai parar em log de proxy.
      headers: { Authorization: `Bearer ${pageAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: to }, messaging_type: "RESPONSE", message: { text } }),
    });
    if (!res.ok) return { ok: false, error: await erroLegivel("Messenger", res) };
    return { ok: true, id: await lerId(res, "ig") };
  } catch (e) {
    return falhaDeRede(e);
  }
}

export async function sendMessengerMedia(
  pageAccessToken: string,
  to: string,
  anexo: AnexoDeSaida,
  legenda: string
): Promise<DeliverResult> {
  if (!anexo.url) return { ok: false, error: "Não foi possível gerar o link do arquivo." };
  try {
    const res = await fetch(`${GRAPH}/me/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${pageAccessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: to },
        messaging_type: "RESPONSE",
        message: { attachment: { type: tipoSocial(anexo.type), payload: { url: anexo.url, is_reusable: false } } },
      }),
    });
    if (!res.ok) return { ok: false, error: await erroLegivel("Messenger", res) };
    const id = await lerId(res, "ig");
    if (legenda) await sendMessengerText(pageAccessToken, to, legenda);
    return { ok: true, id };
  } catch (e) {
    return falhaDeRede(e);
  }
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

export async function sendTelegramText(botToken: string, chatId: string, text: string): Promise<DeliverResult> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) return { ok: false, error: await erroLegivel("Telegram", res) };
    return { ok: true, id: await lerId(res, "tg") };
  } catch (e) {
    return falhaDeRede(e);
  }
}

export async function sendTelegramMedia(
  botToken: string,
  chatId: string,
  anexo: AnexoDeSaida,
  legenda: string
): Promise<DeliverResult> {
  if (!anexo.url) return { ok: false, error: "Não foi possível gerar o link do arquivo." };
  const metodo =
    anexo.type === "image" ? "sendPhoto"
    : anexo.type === "video" ? "sendVideo"
    : anexo.type === "audio" ? "sendAudio"
    : anexo.type === "sticker" ? "sendSticker"
    : "sendDocument";
  const campo =
    metodo === "sendPhoto" ? "photo"
    : metodo === "sendVideo" ? "video"
    : metodo === "sendAudio" ? "audio"
    : metodo === "sendSticker" ? "sticker"
    : "document";

  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/${metodo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, [campo]: anexo.url, ...(legenda && campo !== "sticker" ? { caption: legenda } : {}) }),
    });
    if (!res.ok) return { ok: false, error: await erroLegivel("Telegram", res) };
    return { ok: true, id: await lerId(res, "tg") };
  } catch (e) {
    return falhaDeRede(e);
  }
}

// ---------------------------------------------------------------------------
// Entrega
// ---------------------------------------------------------------------------

export interface DeliverInput {
  agentId: string;
  channel: string;
  /** telefone, igsid ou chat_id — o mesmo valor de Conversation.contactId. */
  to: string;
  text: string;
  /** Quando existe, whatsapp_meta manda como modelo aprovado em vez de texto. */
  template?: { name: string; languageCode: string; parameters: string[] };
  /** Arquivo a enviar. O texto vira legenda, ou mensagem à parte quando o canal não aceita legenda. */
  media?: AnexoDeSaida;
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
    const item = await prisma.outboundQueueItem.create({
      data: {
        agentId,
        contactId: to,
        text,
        broadcastId: input.broadcastId ?? null,
        variantId: input.variantId ?? null,
        enrollmentId: input.enrollmentId ?? null,
        mediaPath: input.media?.path ?? null,
        mediaType: input.media?.type ?? null,
        mediaMime: input.media?.mime ?? null,
        mediaName: input.media?.name ?? null,
      },
    });
    return { ok: true, queued: true, id: item.id };
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
  const { agentId, channel, to, text, media } = input;

  if (channel === "whatsapp_meta") {
    const conn = await prisma.metaConnection.findUnique({ where: { agentId } });
    if (!conn) return { ok: false, error: "Agente sem conexão WhatsApp oficial." };
    const token = decryptSecret(conn.accessToken);
    if (input.template) {
      return sendWhatsAppTemplate(
        conn.phoneNumberId,
        token,
        to,
        input.template.name,
        input.template.languageCode,
        input.template.parameters
      );
    }
    return media
      ? sendWhatsAppMedia(conn.phoneNumberId, token, to, media, text)
      : sendWhatsAppText(conn.phoneNumberId, token, to, text);
  }

  if (channel === "instagram") {
    const conn = await prisma.instagramConnection.findUnique({ where: { agentId } });
    if (!conn) return { ok: false, error: "Agente sem conexão Instagram configurada." };
    const token = decryptSecret(conn.pageAccessToken);
    return media
      ? sendInstagramMedia(conn.igBusinessId, token, to, media, text)
      : sendInstagramText(conn.igBusinessId, token, to, text);
  }

  if (channel === "telegram") {
    const conn = await prisma.telegramConnection.findUnique({ where: { agentId } });
    if (!conn) return { ok: false, error: "Agente sem bot do Telegram configurado." };
    const token = decryptSecret(conn.botToken);
    return media ? sendTelegramMedia(token, to, media, text) : sendTelegramText(token, to, text);
  }

  if (channel === "messenger") {
    const conn = await prisma.messengerConnection.findUnique({ where: { agentId } });
    if (!conn) return { ok: false, error: "Agente sem Página do Messenger conectada." };
    const token = decryptSecret(conn.pageAccessToken);
    return media ? sendMessengerMedia(token, to, media, text) : sendMessengerText(token, to, text);
  }

  if (channel === "tiktok") {
    if (media) return { ok: false, error: "O TikTok só aceita texto por aqui." };
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
