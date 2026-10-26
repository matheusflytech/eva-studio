import "server-only";
import { prisma } from "@/lib/db/prisma";
import { agentePausado } from "@/lib/server/inbox";
import { urlAssinada } from "@/lib/server/storage";

// ---------------------------------------------------------------------------
// Atendimento humano no chat do site. O site (widget da Eva, chat do Drawing
// Club) não recebe mensagem empurrada: ele só vê o que volta quando o
// visitante escreve. Quando um atendente assume e responde pela Caixa de
// entrada, a mensagem fica gravada aqui e o site BUSCA as novas de tempos em
// tempos (ver `mensagensDoAtendente`). Nada a enviar do nosso lado.
// ---------------------------------------------------------------------------

export const CANAL_DO_SITE = "website";

/** Quanto voltar no tempo quando o site ainda não sabe a última que mostrou
 * (aba recarregada, visitante que volta horas depois). */
const JANELA_SEM_CORTE_MS = 24 * 60 * 60 * 1000;
const MAX_POR_BUSCA = 20;

export interface MensagemDoAtendente {
  id: string;
  text: string;
  autor: string | null;
  createdAt: string;
  /** Anexo do atendente; o link assinado vale 1 hora (a próxima busca gera outro). */
  media?: { type: string; url: string; name: string | null };
}

export interface NovasDoSite {
  /** Um humano está com a conversa (a IA não responde). */
  humano: boolean;
  messages: MensagemDoAtendente[];
}

/** O que o site mostra de novo: mensagens do atendente depois de `depois`. */
export async function mensagensDoAtendente(agentId: string, contactId: string, depois: string | null | undefined): Promise<NovasDoSite> {
  const conversa = await prisma.conversation.findUnique({
    where: { agentId_channel_contactId: { agentId, channel: CANAL_DO_SITE, contactId } },
    select: { id: true, status: true },
  });
  if (!conversa) return { humano: false, messages: [] };

  const d = depois ? new Date(depois) : null;
  const corte = d && !Number.isNaN(d.getTime()) ? d : new Date(Date.now() - JANELA_SEM_CORTE_MS);
  const linhas = await prisma.message.findMany({
    where: { conversationId: conversa.id, role: "human", createdAt: { gt: corte } },
    orderBy: { createdAt: "asc" },
    take: MAX_POR_BUSCA,
    select: { id: true, text: true, createdAt: true, mediaPath: true, mediaType: true, mediaName: true, author: { select: { name: true } } },
  });
  return {
    humano: agentePausado(conversa.status),
    messages: await Promise.all(
      linhas.map(async (m) => {
        const url = m.mediaPath ? await urlAssinada(m.mediaPath) : null;
        return {
          id: m.id,
          text: m.text,
          autor: m.author?.name ?? null,
          createdAt: m.createdAt.toISOString(),
          ...(url && m.mediaType ? { media: { type: m.mediaType, url, name: m.mediaName } } : {}),
        };
      })
    ),
  };
}

/** Um humano está com esta conversa do site? (o site então não chama a IA dele) */
export async function humanoNaConversa(agentId: string, contactId: string): Promise<boolean> {
  const conversa = await prisma.conversation.findUnique({
    where: { agentId_channel_contactId: { agentId, channel: CANAL_DO_SITE, contactId } },
    select: { status: true },
  });
  return !!conversa && agentePausado(conversa.status);
}
