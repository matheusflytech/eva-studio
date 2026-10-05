import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { advanceConversation } from "@/lib/server/flow-engine";
import { decryptSecret } from "@/lib/server/crypto";
import { timingSafeEqualStr } from "@/lib/server/secure-compare";
import { guardarMidiaTelegram, orgDoAgente, textoDeAnexo, type MidiaGuardada } from "@/lib/server/media-inbound";

// ---------------------------------------------------------------------------
// Webhook do Telegram.
//
// Um webhook por agente (a URL carrega o agentId), diferente do da Meta, que
// é compartilhado e descobre o agente pelo phone_number_id do payload. Aqui
// dá pra ser direto, porque cada bot pertence a um agente só.
//
// Autenticidade: o secret_token registrado no setWebhook volta no header
// X-Telegram-Bot-Api-Secret-Token. Sem ele, qualquer um que descobrisse a URL
// conseguiria injetar conversa falsa no fluxo.
// ---------------------------------------------------------------------------

interface TelegramArquivo {
  file_id?: string;
  mime_type?: string;
  file_name?: string;
}

interface TelegramUpdate {
  message?: {
    message_id?: number;
    chat?: { id?: number | string; first_name?: string; username?: string };
    from?: { first_name?: string; username?: string };
    text?: string;
    caption?: string;
    // O Telegram manda a mesma foto em vários tamanhos; o último é o maior.
    photo?: { file_id?: string }[];
    document?: TelegramArquivo;
    voice?: TelegramArquivo;
    audio?: TelegramArquivo;
    video?: TelegramArquivo;
    video_note?: TelegramArquivo;
    sticker?: TelegramArquivo & { is_animated?: boolean; is_video?: boolean };
    location?: { latitude?: number; longitude?: number };
    contact?: { first_name?: string; phone_number?: string };
  };
  callback_query?: {
    id?: string;
    data?: string;
    message?: { chat?: { id?: number | string } };
    from?: { first_name?: string; username?: string };
  };
}

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = await params;

  // Segredo primeiro, antes de qualquer consulta: além de ser a ordem certa,
  // evita que a resposta revele se um agente tem Telegram conectado ou não.
  const expectedSecret = process.env.INTERNAL_API_SECRET;
  if (expectedSecret) {
    const header = request.headers.get("x-telegram-bot-api-secret-token");
    if (!timingSafeEqualStr(header, expectedSecret)) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }
  }

  const conn = await prisma.telegramConnection.findUnique({ where: { agentId } });
  // Sempre 200 quando não há o que fazer: o Telegram repete update que não
  // recebeu 2xx, e um retry infinito de algo que nunca vai funcionar só gera ruído.
  if (!conn) return NextResponse.json({ ok: true });

  const update = (await request.json().catch(() => null)) as TelegramUpdate | null;
  if (!update) return NextResponse.json({ ok: true });

  const chatId = update.message?.chat?.id ?? update.callback_query?.message?.chat?.id;
  if (chatId === undefined || chatId === null) return NextResponse.json({ ok: true });

  const contactId = String(chatId);
  let text = update.message?.text;
  let media: MidiaGuardada | undefined;
  // Botão tocado: o `data` do callback carrega o id da opção do bloco de
  // Captura, mesma semântica do optionId dos outros canais.
  const optionId = update.callback_query?.data;

  // Anexos. Antes só texto passava e o resto sumia sem rastro.
  const m = update.message;
  if (m && text === undefined) {
    const orgId = await orgDoAgente(agentId);
    const legenda = m.caption;

    const arquivo: { id?: string; tipo: "image" | "audio" | "video" | "document" | "sticker"; dica?: string; nome?: string } | null =
      m.photo?.length
        ? { id: m.photo[m.photo.length - 1].file_id, tipo: "image", dica: "image/jpeg" }
        : m.voice
          ? { id: m.voice.file_id, tipo: "audio", dica: m.voice.mime_type ?? "audio/ogg" }
          : m.audio
            ? { id: m.audio.file_id, tipo: "audio", dica: m.audio.mime_type, nome: m.audio.file_name }
            : m.video
              ? { id: m.video.file_id, tipo: "video", dica: m.video.mime_type ?? "video/mp4" }
              : m.video_note
                ? { id: m.video_note.file_id, tipo: "video", dica: "video/mp4" }
                : m.document
                  ? { id: m.document.file_id, tipo: "document", dica: m.document.mime_type, nome: m.document.file_name }
                  : m.sticker && !m.sticker.is_animated && !m.sticker.is_video
                    ? { id: m.sticker.file_id, tipo: "sticker", dica: "image/webp" }
                    : null;

    if (arquivo) {
      const guardada =
        orgId && arquivo.id
          ? await guardarMidiaTelegram(orgId, conn.botToken, arquivo.id, {
              mimeDica: arquivo.dica,
              name: arquivo.nome,
              tipoForcado: arquivo.tipo === "sticker" ? "sticker" : undefined,
            })
          : null;
      media = guardada ?? undefined;
      text = textoDeAnexo(arquivo.tipo, legenda, !guardada);
    } else if (m.location) {
      text = `[Localização] https://maps.google.com/?q=${m.location.latitude},${m.location.longitude}`;
    } else if (m.contact) {
      text = `[Contato compartilhado] ${[m.contact.first_name, m.contact.phone_number].filter(Boolean).join(" ")}`;
    } else if (m.sticker) {
      text = "[Figurinha]";
    }
  }

  if (text === undefined && optionId === undefined && !media) return NextResponse.json({ ok: true });

  const result = await advanceConversation({
    agentId,
    channel: "telegram",
    contactId,
    text,
    optionId,
    media,
    externalId: update.message?.message_id ? String(update.message.message_id) : undefined,
  });

  const token = decryptSecret(conn.botToken);

  // Confirma o toque do botão, senão o Telegram deixa o "carregando" girando.
  if (update.callback_query?.id) {
    await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: update.callback_query.id }),
    }).catch(() => {});
  }

  for (const message of result.messages) {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: contactId,
        text: message.text,
        // Opções do bloco de Captura viram teclado inline — é o equivalente
        // aos botões do WhatsApp, e mantém o fluxo idêntico entre canais.
        reply_markup:
          message.options && message.options.length > 0
            ? { inline_keyboard: message.options.map((o) => [{ text: o.label, callback_data: o.id }]) }
            : undefined,
      }),
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}
