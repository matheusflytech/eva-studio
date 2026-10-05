import "server-only";
import { prisma } from "@/lib/db/prisma";
import { janelaDeResposta, CANAIS_RESPONDIVEIS, type JanelaDeResposta } from "@/lib/server/inbox";

// ---------------------------------------------------------------------------
// Leitura da caixa de entrada.
//
// A lista e o detalhe mostram a mesma conversa; se cada rota montasse o objeto
// à sua maneira, a tela teria dois jeitos de saber se uma conversa está "sem
// leitura". Aqui é um formato só.
// ---------------------------------------------------------------------------

/** Conversas de teste: o Playground e a prévia do Builder. Não são clientes. */
export const CANAIS_DE_TESTE = ["playground", "builder_preview"];

export interface ItemDeConversa {
  id: string;
  agentId: string;
  agentName: string;
  channel: string;
  /** O id do lado de fora (telefone, igsid). Não é pra exibir como nome. */
  contactId: string;
  nome: string;
  status: string;
  assignedTo: { id: string; name: string } | null;
  naoLidas: number;
  lastMessageAt: string;
  lastMessageText: string;
  lastMessageRole: string;
  janela: JanelaDeResposta;
  contato: { id: string; name: string; phone: string; email: string; empresa: string | null } | null;
  negocio: { id: string; name: string; etapa: string; valorCents: number } | null;
  /** Um atendente consegue escrever de volta por este canal? */
  respondivel: boolean;
  /** Playground e prévia: a resposta fica registrada mas não vai pra ninguém. */
  simulado: boolean;
}

/** 5511988887777 -> +55 11 98888-7777. O resto passa como veio. */
export function formatarTelefone(bruto: string): string {
  const d = bruto.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("55")) return `+55 ${d.slice(2, 4)} ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 12 && d.startsWith("55")) return `+55 ${d.slice(2, 4)} ${d.slice(4, 8)}-${d.slice(8)}`;
  if (d.length >= 10 && d.length <= 15 && d === bruto.replace(/\s|\+|-/g, "")) return `+${d}`;
  return bruto;
}

/** O que mostrar como nome quando ainda não há ficha com nome. */
function nomeParaExibir(channel: string, contactId: string, nomeDaFicha: string | undefined): string {
  if (nomeDaFicha?.trim()) return nomeDaFicha.trim();
  if (channel === "whatsapp_meta" || channel === "whatsapp_qr") {
    // O QR usa o JID inteiro (5511...@s.whatsapp.net). "@lid" e um identificador
    // de privacidade do WhatsApp, nao um telefone: formatar como numero mostraria
    // digitos que nao levam a ninguem.
    const [parte, sufixo] = contactId.split("@");
    if (sufixo === "lid") return `Contato WhatsApp …${parte.slice(-4)}`;
    return formatarTelefone(parte);
  }
  if (channel === "website") return "Visitante do site";
  if (channel === "playground" || channel === "builder_preview") return "Teste";
  return `Contato …${contactId.slice(-4)}`;
}

interface LinhaDeConversa {
  id: string;
  agentId: string;
  channel: string;
  contactId: string;
  status: string;
  lastMessageAt: Date;
  lastMessageText: string;
  lastMessageRole: string;
  lastContactMessageAt: Date | null;
  contactRecordId: string | null;
  agent: { name: string };
  assignedTo: { id: string; name: string } | null;
  contact: {
    id: string;
    name: string;
    phone: string;
    email: string;
    company: { name: string } | null;
  } | null;
}

export const INCLUDE_CONVERSA = {
  agent: { select: { name: true } },
  assignedTo: { select: { id: true, name: true } },
  contact: {
    select: { id: true, name: true, phone: true, email: true, company: { select: { name: true } } },
  },
} as const;

export async function montarItens(linhas: LinhaDeConversa[]): Promise<ItemDeConversa[]> {
  if (linhas.length === 0) return [];
  const ids = linhas.map((l) => l.id);
  const contatos = [...new Set(linhas.map((l) => l.contactRecordId).filter((c): c is string => !!c))];

  const [naoLidas, negocios] = await Promise.all([
    // Quantas mensagens do contato chegaram depois da última vez que alguém
    // abriu a conversa. Uma consulta pra lista inteira, não uma por linha.
    prisma.$queryRaw<{ id: string; n: number }[]>`
      SELECT m."conversationId" AS id, COUNT(*)::int AS n
        FROM eva_studio_messages m
        JOIN eva_studio_conversations c ON c.id = m."conversationId"
       WHERE m."conversationId" = ANY(${ids})
         AND m.role = 'contact'
         AND (c."readAt" IS NULL OR m."createdAt" > c."readAt")
       GROUP BY 1
    `,
    contatos.length === 0
      ? Promise.resolve([])
      : prisma.dealContact.findMany({
          where: { contactId: { in: contatos }, deal: { closedAt: null, archivedAt: null } },
          include: { deal: { select: { id: true, name: true, amountCents: true, updatedAt: true, stage: { select: { name: true } } } } },
        }),
  ]);

  const porConversa = new Map(naoLidas.map((r) => [r.id, Number(r.n)]));

  // Um contato pode ter vários negócios abertos; o da lista é o mexido por último.
  const negocioDoContato = new Map<string, ItemDeConversa["negocio"] & { em: number }>();
  for (const dc of negocios) {
    const em = dc.deal.updatedAt.getTime();
    const atual = negocioDoContato.get(dc.contactId);
    if (!atual || em > atual.em) {
      negocioDoContato.set(dc.contactId, {
        id: dc.deal.id,
        name: dc.deal.name,
        etapa: dc.deal.stage.name,
        valorCents: dc.deal.amountCents,
        em,
      });
    }
  }

  return linhas.map((l) => {
    const n = l.contactRecordId ? negocioDoContato.get(l.contactRecordId) : undefined;
    return {
      id: l.id,
      agentId: l.agentId,
      agentName: l.agent.name,
      channel: l.channel,
      contactId: l.contactId,
      nome: nomeParaExibir(l.channel, l.contactId, l.contact?.name),
      status: l.status,
      assignedTo: l.assignedTo,
      naoLidas: porConversa.get(l.id) ?? 0,
      lastMessageAt: l.lastMessageAt.toISOString(),
      lastMessageText: l.lastMessageText,
      lastMessageRole: l.lastMessageRole,
      janela: janelaDeResposta(l.channel, l.lastContactMessageAt),
      contato: l.contact
        ? {
            id: l.contact.id,
            name: l.contact.name,
            phone: l.contact.phone,
            email: l.contact.email,
            empresa: l.contact.company?.name ?? null,
          }
        : null,
      negocio: n ? { id: n.id, name: n.name, etapa: n.etapa, valorCents: n.valorCents } : null,
      respondivel: CANAIS_RESPONDIVEIS.has(l.channel),
      simulado: CANAIS_DE_TESTE.includes(l.channel),
    };
  });
}

export interface MensagemSerializada {
  id: string;
  role: string;
  text: string;
  createdAt: string;
  author: { id: string; name: string } | null;
  media: { url: string; type: string; mime: string; name: string | null; size: number | null } | null;
  /** Só pra mensagens que saíram daqui (bot e atendente). */
  entrega: { status: string; erro: string | null; atrasada: boolean } | null;
}

interface LinhaDeMensagem {
  id: string;
  role: string;
  text: string;
  createdAt: Date;
  mediaPath: string | null;
  mediaType: string | null;
  mediaMime: string | null;
  mediaName: string | null;
  mediaSize: number | null;
  externalId: string | null;
  deliveryStatus: string;
  deliveryError: string | null;
  author: { id: string; name: string } | null;
}

/** Quanto tempo um item pode ficar na fila do worker antes de acender o aviso. */
const MINUTOS_ATE_ATRASADA = 3;

/**
 * Mensagem de WhatsApp por QR não sai na hora: vai pra uma fila e o worker
 * manda. Esta função olha a fila e atualiza o que já saiu ou falhou — e marca
 * como atrasada a que está parada há tempo demais, que quase sempre quer dizer
 * "o worker está fora do ar" e é exatamente o que o atendente precisa saber.
 */
export async function reconciliarFila(linhas: LinhaDeMensagem[]): Promise<Map<string, { status: string; erro: string | null }>> {
  const pendentes = linhas.filter((m) => m.deliveryStatus === "queued" && m.externalId);
  const resultado = new Map<string, { status: string; erro: string | null }>();
  if (pendentes.length === 0) return resultado;

  const itens = await prisma.outboundQueueItem.findMany({
    where: { id: { in: pendentes.map((m) => m.externalId!) } },
    select: { id: true, status: true, error: true },
  });
  const porId = new Map(itens.map((i) => [i.id, i]));

  for (const m of pendentes) {
    const item = porId.get(m.externalId!);
    if (!item) continue;
    if (item.status === "sent") {
      resultado.set(m.id, { status: "sent", erro: null });
      await prisma.message.update({ where: { id: m.id }, data: { deliveryStatus: "sent" } }).catch(() => {});
    } else if (item.status === "failed") {
      const erro = item.error ?? "O worker não conseguiu enviar.";
      resultado.set(m.id, { status: "failed", erro });
      await prisma.message
        .update({ where: { id: m.id }, data: { deliveryStatus: "failed", deliveryError: erro } })
        .catch(() => {});
    }
  }
  return resultado;
}

export async function serializarMensagens(linhas: LinhaDeMensagem[]): Promise<MensagemSerializada[]> {
  const reconciliadas = await reconciliarFila(linhas);

  return linhas.map((m) => {
    const saiuDaqui = m.role === "bot" || m.role === "human";
    const rec = reconciliadas.get(m.id);
    const idade = Date.now() - m.createdAt.getTime();
    // "Enviando" que passou de um minuto e meio nao esta enviando: o processo
    // que cuidava do envio caiu no meio. Mostrar como falha deixa o atendente
    // reenviar, em vez de olhar um relogio girando pra sempre.
    const travada = m.deliveryStatus === "sending" && idade > 90_000;
    const status = travada ? "failed" : (rec?.status ?? m.deliveryStatus);

    return {
      id: m.id,
      role: m.role,
      text: m.text,
      createdAt: m.createdAt.toISOString(),
      author: m.author,
      media: m.mediaPath
        ? {
            url: `/api/media?path=${encodeURIComponent(m.mediaPath)}`,
            type: m.mediaType ?? "document",
            mime: m.mediaMime ?? "application/octet-stream",
            name: m.mediaName,
            size: m.mediaSize,
          }
        : null,
      entrega: saiuDaqui
        ? {
            status,
            erro: travada ? "O envio foi interrompido. Tente de novo." : (rec?.erro ?? m.deliveryError),
            atrasada: status === "queued" && idade > MINUTOS_ATE_ATRASADA * 60_000,
          }
        : null,
    };
  });
}

export const INCLUDE_MENSAGEM = {
  author: { select: { id: true, name: true } },
} as const;
