import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { advanceConversation, type OutboundMessage } from "@/lib/server/flow-engine";
import { matchCommentAutomation } from "@/lib/server/comment-automation";
import { verifyMetaSignature } from "@/lib/server/meta-signature";
import { decryptSecret } from "@/lib/server/crypto";
import { checkRateLimit } from "@/lib/server/rate-limit";
import { registrarMensagens } from "@/lib/server/inbox";
import { sendInstagramText, sendMessengerText, type DeliverResult } from "@/lib/server/outbound";
import {
  baixarEGuardar,
  guardarMidiaWhatsApp,
  orgDoAgente,
  textoDeAnexo,
  tipoDoAnexoSocial,
  type MidiaGuardada,
} from "@/lib/server/media-inbound";

// Idempotência: a Meta pode reentregar o mesmo evento. Guarda o id do evento
// por 24h (reusa a tabela de rate limit como store de "já visto") e ignora
// reentregas — evita DM/resposta duplicada. Retorna true se é NOVO.
async function isFirstDelivery(eventId: string | undefined): Promise<boolean> {
  if (!eventId) return true; // sem id não dá pra deduplicar; processa
  const { count } = await checkRateLimit(`evt:${eventId}`, 1, 86_400);
  return count <= 1;
}

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

interface MetaMidia {
  id?: string;
  mime_type?: string;
  caption?: string;
  filename?: string;
}

interface MetaMessage {
  id?: string;
  from: string;
  type: string;
  text?: { body?: string };
  // Resposta rápida de um botão de template (não é o mesmo que "interactive").
  button?: { text?: string; payload?: string };
  interactive?: {
    button_reply?: { id: string };
    list_reply?: { id: string };
  };
  image?: MetaMidia;
  audio?: MetaMidia;
  video?: MetaMidia;
  document?: MetaMidia;
  sticker?: MetaMidia;
  location?: { latitude?: number; longitude?: number; name?: string; address?: string };
  contacts?: { name?: { formatted_name?: string }; phones?: { phone?: string }[] }[];
}

// Recibo de entrega: a Meta avisa quando uma mensagem NOSSA foi enviada,
// entregue, lida ou falhou. Sem isso, "enviado" na caixa de entrada é só uma
// esperança.
interface MetaStatus {
  id?: string;
  status?: string;
  errors?: { code?: number; title?: string; message?: string; error_data?: { details?: string } }[];
}

interface MetaValue {
  metadata?: { phone_number_id?: string };
  messages?: MetaMessage[];
  statuses?: MetaStatus[];
}

interface AnexoSocial {
  type?: string;
  payload?: { url?: string; coordinates?: { lat?: number; long?: number } };
}

interface InstagramMessagingEvent {
  sender?: { id?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: AnexoSocial[] };
}

interface InstagramCommentValue {
  id?: string;
  text?: string;
  from?: { id?: string; username?: string };
  media?: { id?: string };
}

interface EnvioMeta extends DeliverResult {
  /** wamid da mensagem enviada: é por ele que o recibo de entrega acha a linha. */
  id?: string;
  /** Não foi tentado de propósito (ex.: fora da janela e sem modelo). */
  pulado?: boolean;
}

async function sendMetaMessage(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  message: OutboundMessage
): Promise<EnvioMeta> {
  // Fora da janela de 24h, sem modelo aprovado escolhido pro bloco — a Meta
  // vai rejeitar texto livre mesmo, então nem tenta: evita gastar chamada de
  // API sabendo que vai falhar (ver docs/CHATBOT_ENGINE.md).
  if (message.requiresTemplate) {
    return {
      ok: false,
      pulado: true,
      error: "Fora da janela de 24h e sem modelo aprovado escolhido neste bloco. A mensagem não foi enviada.",
    };
  }

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

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id?: string }[];
      error?: { message?: string };
    };
    if (!res.ok) return { ok: false, error: json.error?.message ?? `A Meta respondeu ${res.status}.` };
    return { ok: true, id: json.messages?.[0]?.id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Falha de rede ao falar com a Meta." };
  }
}

/**
 * Deixa no registro o que aconteceu com a resposta do agente: o id pra receber
 * o recibo de entrega, ou o motivo se não saiu. Antes um bot que a Meta
 * recusava continuava aparecendo como "enviado" e ninguém ficava sabendo.
 */
async function anotarEnvioDoBot(
  agentId: string,
  channel: string,
  contactId: string,
  texto: string,
  envio: DeliverResult & { id?: string }
) {
  try {
    const conversa = await prisma.conversation.findUnique({
      where: { agentId_channel_contactId: { agentId, channel, contactId } },
      select: { id: true },
    });
    if (!conversa) return;
    const msg = await prisma.message.findFirst({
      where: { conversationId: conversa.id, role: "bot", text: texto, externalId: null, deliveryStatus: "sent" },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!msg) return;
    await prisma.message.update({
      where: { id: msg.id },
      data: envio.ok
        ? { externalId: envio.id ?? null }
        : { deliveryStatus: "failed", deliveryError: (envio.error ?? "Falha no envio.").slice(0, 500) },
    });
  } catch {
    // Anotação é cortesia: nunca derruba o atendimento.
  }
}

/** Aplica o recibo da Meta sem nunca retroceder (lido não volta a entregue). */
async function aplicarStatusDeEntrega(statuses: MetaStatus[]) {
  const ordem: Record<string, string[]> = {
    sent: ["sending", "queued"],
    delivered: ["sending", "queued", "sent"],
    read: ["sending", "queued", "sent", "delivered"],
    failed: ["sending", "queued", "sent"],
  };
  for (const st of statuses) {
    if (!st.id || !st.status || !ordem[st.status]) continue;
    const erro = st.errors?.[0];
    await prisma.message
      .updateMany({
        where: { externalId: st.id, deliveryStatus: { in: ordem[st.status] } },
        data:
          st.status === "failed"
            ? {
                deliveryStatus: "failed",
                deliveryError: [erro?.title, erro?.message, erro?.error_data?.details]
                  .filter(Boolean)
                  .join(": ")
                  .slice(0, 500) || "A Meta não conseguiu entregar.",
              }
            : { deliveryStatus: st.status },
      })
      .catch(() => {});
  }
}

// Instagram não tem "modelo aprovado" — fora da janela de 24h simplesmente
// não dá pra iniciar contato (ver docs/CHATBOT_ENGINE.md §6), então aqui só
// manda texto puro mesmo; requiresTemplate/template do motor não se aplicam
// (o motor só ativa essa lógica pro canal whatsapp_meta).
// (o envio de texto do Instagram vem de lib/server/outbound.ts, que confere a
// resposta da Meta em vez de assumir que deu certo.)

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

/**
 * Traduz o que o cliente mandou no WhatsApp para o que o motor entende.
 *
 * Antes só texto e botão passavam; foto, áudio, documento, localização e
 * contato eram descartados em silêncio. Aqui cada tipo vira texto legível na
 * conversa e, quando há arquivo, ele é baixado e guardado.
 */
async function lerEntradaWhatsApp(
  m: MetaMessage,
  orgId: string | null,
  token: string
): Promise<{ text?: string; optionId?: string; media?: MidiaGuardada } | null> {
  const optionId = m.interactive?.button_reply?.id ?? m.interactive?.list_reply?.id;
  if (optionId) return { optionId };

  if (m.type === "reaction") return null; // emoji sobre uma mensagem: não é fala
  if (m.type === "text") return m.text?.body ? { text: m.text.body } : null;
  if (m.type === "button") return m.button?.text ? { text: m.button.text } : null;

  if (m.type === "image" || m.type === "audio" || m.type === "video" || m.type === "document" || m.type === "sticker") {
    const corpo = m[m.type];
    const midia =
      orgId && corpo?.id
        ? await guardarMidiaWhatsApp(orgId, corpo.id, token, {
            mimeDica: corpo.mime_type,
            name: corpo.filename,
            tipoForcado: m.type === "sticker" ? "sticker" : undefined,
          })
        : null;
    return { text: textoDeAnexo(m.type, corpo?.caption, !midia), media: midia ?? undefined };
  }

  if (m.type === "location" && m.location) {
    const { latitude, longitude, name, address } = m.location;
    const onde = [name, address].filter(Boolean).join(", ");
    return { text: `[Localização]${onde ? ` ${onde}` : ""} https://maps.google.com/?q=${latitude},${longitude}` };
  }

  if (m.type === "contacts" && m.contacts?.length) {
    const lista = m.contacts
      .map((c) => [c.name?.formatted_name, c.phones?.[0]?.phone].filter(Boolean).join(" "))
      .filter(Boolean)
      .join("; ");
    return { text: `[Contato compartilhado] ${lista}` };
  }

  if (m.text?.body) return { text: m.text.body };
  return { text: `[Mensagem não suportada: ${m.type}]` };
}

async function handleWhatsAppEntries(entries: unknown[]) {
  for (const entry of entries as { changes?: { value?: MetaValue }[] }[]) {
    for (const change of entry.changes ?? []) {
      const value: MetaValue = change.value ?? {};
      const phoneNumberId = value.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      // Recibo de entrega das mensagens que NÓS mandamos.
      if (value.statuses?.length) await aplicarStatusDeEntrega(value.statuses);

      if (!value.messages) continue;

      const connection = await prisma.metaConnection.findUnique({ where: { phoneNumberId } });
      if (!connection) continue;
      const token = decryptSecret(connection.accessToken);
      const orgId = await orgDoAgente(connection.agentId);

      for (const message of value.messages) {
        if (!(await isFirstDelivery(message.id))) continue; // reentrega da Meta, ignora

        try {
          const entrada = await lerEntradaWhatsApp(message, orgId, token);
          if (!entrada) continue;

          const result = await advanceConversation({
            agentId: connection.agentId,
            channel: "whatsapp_meta",
            contactId: message.from,
            text: entrada.text,
            optionId: entrada.optionId,
            media: entrada.media,
            externalId: message.id,
          });
          for (const reply of result.messages) {
            const envio = await sendMetaMessage(phoneNumberId, token, message.from, reply);
            await anotarEnvioDoBot(connection.agentId, "whatsapp_meta", message.from, reply.text, envio);
          }
        } catch (e) {
          // Falha isolada por mensagem não deve derrubar o resto do batch —
          // mas fica no log, porque engolir em silêncio é como se perde cliente.
          console.error("[webhook/meta] falha ao processar mensagem", e instanceof Error ? e.message : e);
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
  await registrarMensagens(conversation.id, [
    { role: "contact", text: `[comentário] ${commentText}` },
    { role: "bot", text: dmMessage },
  ]);
  await prisma.commentAutomation.update({ where: { id: automationId }, data: { triggerCount: { increment: 1 } } });
}

// Messenger usa /me/messages com recipient.id, não o "to" do WhatsApp — é a
// diferença de formato entre os dois produtos dentro da mesma Graph API.
// (idem para o Messenger.)

interface MessengerEvent {
  sender?: { id?: string };
  message?: { mid?: string; text?: string; is_echo?: boolean; attachments?: AnexoSocial[] };
  postback?: { payload?: string };
}

/**
 * Instagram e Messenger entregam anexos do mesmo jeito: uma lista com a URL no
 * payload. Devolve o primeiro anexo como o "da mensagem" e o resto à parte —
 * dez fotos num DM não podem disparar o fluxo dez vezes, mas também não podem
 * sumir.
 */
async function lerEntradaSocial(
  message: { text?: string; attachments?: AnexoSocial[] },
  orgId: string | null
): Promise<{ text?: string; media?: MidiaGuardada; extras: { texto: string; media?: MidiaGuardada }[] }> {
  const anexos = message.attachments ?? [];
  const lidos: { texto: string; media?: MidiaGuardada }[] = [];

  for (const a of anexos) {
    const tipo = tipoDoAnexoSocial(a.type);
    if (tipo) {
      const midia =
        orgId && a.payload?.url ? await baixarEGuardar(orgId, a.payload.url, { tipoForcado: tipo }) : null;
      lidos.push({ texto: textoDeAnexo(tipo, undefined, !midia), media: midia ?? undefined });
    } else if (a.type === "location" && a.payload?.coordinates) {
      const { lat, long } = a.payload.coordinates;
      lidos.push({ texto: `[Localização] https://maps.google.com/?q=${lat},${long}` });
    } else {
      lidos.push({ texto: `[Anexo não suportado${a.type ? `: ${a.type}` : ""}]` });
    }
  }

  const texto = message.text?.trim() || undefined;
  const [primeiro, ...resto] = lidos;
  return {
    // Legenda e anexo juntos: o texto que a pessoa escreveu prevalece sobre o rótulo.
    text: texto ?? primeiro?.texto,
    media: primeiro?.media,
    extras: resto,
  };
}

/** Anexos além do primeiro entram na conversa sem rodar o fluxo de novo. */
async function registrarAnexosExtras(
  agentId: string,
  channel: string,
  contactId: string,
  extras: { texto: string; media?: MidiaGuardada }[]
) {
  if (extras.length === 0) return;
  const conversa = await prisma.conversation.findUnique({
    where: { agentId_channel_contactId: { agentId, channel, contactId } },
    select: { id: true },
  });
  if (!conversa) return;
  await registrarMensagens(
    conversa.id,
    extras.map((e) => ({
      role: "contact" as const,
      text: e.texto,
      mediaPath: e.media?.path,
      mediaType: e.media?.type,
      mediaMime: e.media?.mime,
      mediaName: e.media?.name,
      mediaSize: e.media?.size,
    }))
  );
}

// Entradas do Messenger (body.object === "page"). A entry.id é o id da
// Página, que é como a conexão do agente é descoberta — mesmo papel que o
// phone_number_id tem no WhatsApp e o igBusinessId no Instagram.
async function handleMessengerEntries(entries: unknown[]) {
  for (const entry of entries as { id?: string; messaging?: MessengerEvent[] }[]) {
    const pageId = entry.id;
    if (!pageId) continue;

    const connection = await prisma.messengerConnection.findUnique({ where: { pageId } });
    if (!connection) continue;
    const token = decryptSecret(connection.pageAccessToken);

    for (const event of entry.messaging ?? []) {
      const from = event.sender?.id;
      // is_echo é a própria Página aparecendo no webhook ao enviar; entrar no
      // fluxo com isso faria o bot conversar sozinho.
      if (!from || event.message?.is_echo) continue;

      // Botão tocado: o payload carrega o id da opção do bloco de Captura.
      const optionId = event.postback?.payload;
      const temAnexo = (event.message?.attachments?.length ?? 0) > 0;
      if (!event.message?.text && !optionId && !temAnexo) continue;
      if (!(await isFirstDelivery(event.message?.mid))) continue;

      try {
        const orgId = await orgDoAgente(connection.agentId);
        const entrada = await lerEntradaSocial(event.message ?? {}, orgId);

        const result = await advanceConversation({
          agentId: connection.agentId,
          channel: "messenger",
          contactId: from,
          text: entrada.text,
          optionId,
          media: entrada.media,
          externalId: event.message?.mid,
        });
        await registrarAnexosExtras(connection.agentId, "messenger", from, entrada.extras);
        for (const reply of result.messages) {
          const envio = await sendMessengerText(token, from, reply.text);
          await anotarEnvioDoBot(connection.agentId, "messenger", from, reply.text, envio);
        }
      } catch (e) {
        console.error("[webhook/meta] falha no Messenger", e instanceof Error ? e.message : e);
      }
    }
  }
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
    const igAccessToken = decryptSecret(connection.pageAccessToken);

    for (const event of entry.messaging ?? []) {
      const from = event.sender?.id;
      const temAnexo = (event.message?.attachments?.length ?? 0) > 0;
      if (!from || event.message?.is_echo) continue;
      if (!event.message?.text && !temAnexo) continue;
      if (!(await isFirstDelivery(event.message?.mid))) continue;

      try {
        const orgId = await orgDoAgente(connection.agentId);
        const entrada = await lerEntradaSocial(event.message ?? {}, orgId);

        const result = await advanceConversation({
          agentId: connection.agentId,
          channel: "instagram",
          contactId: from,
          text: entrada.text,
          media: entrada.media,
          externalId: event.message?.mid,
        });
        await registrarAnexosExtras(connection.agentId, "instagram", from, entrada.extras);
        for (const reply of result.messages) {
          const envio = await sendInstagramText(igBusinessId, igAccessToken, from, reply.text);
          await anotarEnvioDoBot(connection.agentId, "instagram", from, reply.text, envio);
        }
      } catch (e) {
        console.error("[webhook/meta] falha no Instagram", e instanceof Error ? e.message : e);
      }
    }

    for (const change of entry.changes ?? []) {
      if (change.field !== "comments") continue;
      const comment = change.value ?? {};
      const commentId = comment.id;
      const commenterId = comment.from?.id;
      const text = comment.text;
      if (!commentId || !commenterId || !text) continue;
      if (!(await isFirstDelivery(commentId))) continue; // reentrega da Meta, ignora

      try {
        const automations = await prisma.commentAutomation.findMany({ where: { agentId: connection.agentId } });
        const match = matchCommentAutomation(automations, { mediaId: comment.media?.id ?? "", text });
        if (!match) continue;

        await handleMatchedComment(
          connection.agentId,
          igBusinessId,
          igAccessToken,
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

  // Assinatura obrigatória: lê o corpo CRU e valida o HMAC antes de confiar em
  // qualquer coisa. Sem isso, eventos forjados dirigiriam o bot com os tokens
  // reais da org. Ler como texto (não .json()) é essencial — o HMAC é sobre os
  // bytes exatos que a Meta assinou.
  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");
  if (!verifyMetaSignature(rawBody, signature)) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  let body: { object?: string; entry?: unknown[] };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const entries = body?.entry ?? [];

  // Um webhook, três produtos: WhatsApp manda object "whatsapp_business_account",
  // Instagram manda "instagram" e Messenger manda "page" — mesma Graph API,
  // payloads e formas de envio diferentes (§9 e §21 do CHATBOT_ENGINE.md).
  if (body?.object === "instagram") {
    await handleInstagramEntries(entries);
  } else if (body?.object === "page") {
    await handleMessengerEntries(entries);
  } else {
    await handleWhatsAppEntries(entries);
  }

  return NextResponse.json({ received: true });
}
