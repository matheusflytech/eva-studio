import "server-only";
import { prisma } from "@/lib/db/prisma";
import { tocarAtividadeDaConversa } from "@/lib/server/atividade-do-negocio";
import { publicarEvento } from "@/lib/server/eventos/barramento";

// ---------------------------------------------------------------------------
// Caixa de entrada: as regras num lugar só.
//
// Mensagem entra por cinco caminhos (motor de fluxo, webhook da Meta, resposta
// de atendente, nota interna, comentário do Instagram) e todos precisam deixar
// a conversa no mesmo estado: prévia da última mensagem, hora, e quem escreveu.
// Se cada um atualizasse à mão, a lista mostraria uma prévia velha e a ordem
// ficaria errada. Por isso todos passam por `registrarMensagens`.
// ---------------------------------------------------------------------------

export type PapelDaMensagem = "contact" | "bot" | "human" | "note";

export interface NovaMensagem {
  role: PapelDaMensagem;
  text: string;
  authorId?: string | null;
  mediaPath?: string | null;
  mediaType?: string | null;
  mediaMime?: string | null;
  mediaName?: string | null;
  mediaSize?: number | null;
  externalId?: string | null;
  deliveryStatus?: "sending" | "queued" | "sent" | "delivered" | "read" | "failed";
  deliveryError?: string | null;
}

const ROTULO_DE_MIDIA: Record<string, string> = {
  image: "Foto",
  audio: "Áudio",
  video: "Vídeo",
  document: "Documento",
  sticker: "Figurinha",
};

/** O que aparece na lista: o texto, ou o tipo do anexo quando não há texto. */
export function previaDaMensagem(m: Pick<NovaMensagem, "text" | "mediaType">): string {
  const texto = (m.text ?? "").replace(/\s+/g, " ").trim();
  if (texto) return texto.slice(0, 200);
  if (m.mediaType) return `[${ROTULO_DE_MIDIA[m.mediaType] ?? "Anexo"}]`;
  return "";
}

/**
 * Grava mensagens e atualiza a conversa.
 *
 * Nota interna NÃO mexe na prévia nem na ordem: ela é recado da equipe, e se
 * subisse a conversa pro topo, alguém anotando "ligar amanhã" faria parecer
 * que o cliente tinha escrito.
 */
export async function registrarMensagens(conversationId: string, mensagens: NovaMensagem[]) {
  if (mensagens.length === 0) return [];

  const criadas = await prisma.message.createManyAndReturn({
    data: mensagens.map((m) => ({
      conversationId,
      role: m.role,
      text: m.text,
      authorId: m.authorId ?? null,
      mediaPath: m.mediaPath ?? null,
      mediaType: m.mediaType ?? null,
      mediaMime: m.mediaMime ?? null,
      mediaName: m.mediaName ?? null,
      mediaSize: m.mediaSize ?? null,
      externalId: m.externalId ?? null,
      deliveryStatus: m.deliveryStatus ?? "sent",
      deliveryError: m.deliveryError ?? null,
    })),
  });

  const visiveis = criadas.filter((m) => m.role !== "note");
  const ultima = visiveis[visiveis.length - 1];
  const doContato = visiveis.filter((m) => m.role === "contact");
  // Antes de atualizar: a conversa já tinha mensagem do contato? (gatilho "primeira mensagem")
  const jaTinhaDoContato =
    doContato.length > 0
      ? !!(await prisma.conversation.findUnique({ where: { id: conversationId }, select: { lastContactMessageAt: true } }).catch(() => null))?.lastContactMessageAt
      : true;

  if (ultima) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        lastMessageAt: ultima.createdAt,
        lastMessageText: previaDaMensagem({ text: ultima.text, mediaType: ultima.mediaType }),
        lastMessageRole: ultima.role,
        // A janela de 24h da Meta abre quando o CONTATO escreve — não quando
        // qualquer coisa é gravada.
        ...(doContato.length > 0 ? { lastContactMessageAt: doContato[doContato.length - 1].createdAt } : {}),
      },
    });
    // Mensagem entrando ou saindo zera o relógio do "parado" dos negócios
    // abertos do contato (nota interna não conta: fica fora de `visiveis`).
    await tocarAtividadeDaConversa(conversationId, ultima.createdAt);
  }
  if (doContato.length > 0) await emitirMensagensRecebidas(conversationId, doContato, !jaTinhaDoContato);

  return criadas;
}

/** Evento `message.received`: um por mensagem do contato (webhooks e automações). */
async function emitirMensagensRecebidas(
  conversationId: string,
  mensagens: { id: string; text: string; mediaType: string | null; mediaMime: string | null; createdAt: Date }[],
  primeiraDaConversa: boolean
) {
  const conversa = await prisma.conversation
    .findUnique({
      where: { id: conversationId },
      select: { agentId: true, channel: true, contactId: true, contactRecordId: true, agent: { select: { orgId: true } } },
    })
    .catch(() => null);
  if (!conversa?.agent) return;
  for (const [i, m] of mensagens.entries()) {
    await publicarEvento({
      orgId: conversa.agent.orgId,
      tipo: "message.received",
      objeto: "conversation",
      objetoId: conversationId,
      dados: {
        id: m.id,
        conversation_id: conversationId,
        agent_id: conversa.agentId,
        channel: conversa.channel,
        // Id do contato no canal (número, @ do Instagram) e a ficha no CRM.
        channel_contact_id: conversa.contactId,
        contact_id: conversa.contactRecordId,
        text: m.text,
        media_type: m.mediaType,
        media_mime: m.mediaMime,
        created_at: m.createdAt.toISOString(),
        primeira: primeiraDaConversa && i === 0,
      },
    });
  }
}

// ---------------------------------------------------------------------------
// Janela de atendimento
// ---------------------------------------------------------------------------

const HORA = 60 * 60 * 1000;

/** Canais em que a plataforma só deixa responder dentro de 24h da última mensagem do cliente. */
const CANAIS_COM_JANELA = new Set(["whatsapp_meta", "instagram", "messenger"]);

export interface JanelaDeResposta {
  /** O canal tem a regra das 24h? */
  restrita: boolean;
  /** Dá pra mandar texto livre agora? */
  aberta: boolean;
  expiraEm: string | null;
  minutosRestantes: number | null;
}

export function janelaDeResposta(channel: string, lastContactMessageAt: Date | null): JanelaDeResposta {
  if (!CANAIS_COM_JANELA.has(channel)) {
    return { restrita: false, aberta: true, expiraEm: null, minutosRestantes: null };
  }
  if (!lastContactMessageAt) {
    return { restrita: true, aberta: false, expiraEm: null, minutosRestantes: null };
  }
  const expira = lastContactMessageAt.getTime() + 24 * HORA;
  const restante = expira - Date.now();
  return {
    restrita: true,
    aberta: restante > 0,
    expiraEm: new Date(expira).toISOString(),
    minutosRestantes: restante > 0 ? Math.floor(restante / 60000) : 0,
  };
}

/** Conversas em que o agente fica mudo: ele só volta quando alguém devolver. */
export function agentePausado(status: string): boolean {
  return status === "waiting_human" || status === "human";
}

/** Canais onde um atendente consegue de fato escrever de volta. */
export const CANAIS_RESPONDIVEIS = new Set([
  "whatsapp_meta",
  "whatsapp_qr",
  "instagram",
  "messenger",
  "telegram",
  "tiktok",
]);
