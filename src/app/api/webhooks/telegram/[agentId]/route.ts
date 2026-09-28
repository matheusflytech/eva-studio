import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { advanceConversation } from "@/lib/server/flow-engine";
import { decryptSecret } from "@/lib/server/crypto";
import { timingSafeEqualStr } from "@/lib/server/secure-compare";

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

interface TelegramUpdate {
  message?: {
    chat?: { id?: number | string; first_name?: string; username?: string };
    from?: { first_name?: string; username?: string };
    text?: string;
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
  const text = update.message?.text;
  // Botão tocado: o `data` do callback carrega o id da opção do bloco de
  // Captura, mesma semântica do optionId dos outros canais.
  const optionId = update.callback_query?.data;

  if (text === undefined && optionId === undefined) return NextResponse.json({ ok: true });

  const result = await advanceConversation({ agentId, channel: "telegram", contactId, text, optionId });

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
