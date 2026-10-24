import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { nomesDosProdutosPorNegocio } from "@/lib/server/produtos";
import { ultimaAtividadePorNegocio } from "@/lib/server/atividade-do-negocio";

// ---------------------------------------------------------------------------
// Cartões do quadro de negócios: o que cada cartão traz, como vira JSON e a
// paginação por coluna (Fase L1 do plano de listas). Fica fora do route.ts
// porque arquivo de rota só exporta os métodos HTTP.
// ---------------------------------------------------------------------------

export const INCLUDE_CARTAO = {
  company: { select: { id: true, name: true } },
  owner: { select: { id: true, name: true, avatarPath: true } },
  contacts: {
    include: {
      contact: {
        select: {
          id: true,
          name: true,
          avatarPath: true,
          // Telefone e e-mail: campos que o cartão e a prévia podem mostrar.
          phone: true,
          email: true,
          // Conversa de WhatsApp mais recente: o cartão mostra o atalho e
          // se há mensagem do cliente ainda não lida.
          conversations: {
            where: { channel: { in: ["whatsapp_meta", "whatsapp_qr"] } },
            orderBy: { lastContactMessageAt: "desc" },
            take: 1,
            select: { id: true, readAt: true, lastContactMessageAt: true },
          },
        },
      },
    },
  },
  // Próxima tarefa em aberto (a de prazo mais próximo; sem prazo fica por último).
  tasks: { where: { doneAt: null }, orderBy: { dueAt: "asc" }, take: 1, select: { type: true, text: true, dueAt: true } },
  // Só tarefas em aberto: o número no cartão é "o que falta fazer".
  _count: { select: { tasks: { where: { doneAt: null } } } },
} satisfies Prisma.DealInclude;

export type LinhaDoCartao = Prisma.DealGetPayload<{ include: typeof INCLUDE_CARTAO }>;

export function serializarCartao(d: LinhaDoCartao) {
  return {
    id: d.id,
    name: d.name,
    amountCents: d.amountCents,
    currency: d.currency,
    probability: d.probability,
    company: d.company,
    owner: d.owner,
    contacts: d.contacts.map((c) => ({ id: c.contact.id, name: c.contact.name, avatarPath: c.contact.avatarPath, phone: c.contact.phone, email: c.contact.email })),
    whatsapp: (() => {
      const conversa = d.contacts.map((c) => c.contact.conversations[0]).find(Boolean);
      if (!conversa) return null;
      const naoLida = !!conversa.lastContactMessageAt && (!conversa.readAt || conversa.lastContactMessageAt > conversa.readAt);
      return { conversationId: conversa.id, naoLida };
    })(),
    nextTask: d.tasks[0]
      ? { type: d.tasks[0].type, text: d.tasks[0].text, dueAt: d.tasks[0].dueAt?.toISOString() ?? null }
      : null,
    openTasks: d._count.tasks,
    customFields: (d.customFields ?? {}) as Record<string, unknown>,
    expectedClosingAt: d.expectedClosingAt?.toISOString() ?? null,
    closedAt: d.closedAt?.toISOString() ?? null,
    createdAt: d.createdAt.toISOString(),
    stageSince: d.stageSince.toISOString(),
  };
}

export type Cartao = ReturnType<typeof serializarCartao> & { produtos?: string[]; lastActivityAt?: string | null };

/** Junta a última atividade (relógio do "parado"). Sem a tabela, fica null e vale a entrada na etapa. */
export async function comAtividade(cartoes: Cartao[]): Promise<Cartao[]> {
  const mapa = await ultimaAtividadePorNegocio(cartoes.map((c) => c.id));
  return cartoes.map((c) => ({ ...c, lastActivityAt: mapa.get(c.id)?.toISOString() ?? null }));
}

/** Junta os nomes dos produtos aos cartões (só quando o layout mostra produtos). */
export async function comProdutos(orgId: string, cartoes: Cartao[]): Promise<Cartao[]> {
  const nomes = await nomesDosProdutosPorNegocio(orgId, cartoes.map((c) => c.id));
  return cartoes.map((c) => ({ ...c, produtos: nomes.get(c.id) ?? [] }));
}

// ── Paginação por coluna ───────────────────────────────────────────────────

/** Cartões por coluna quando a tela pede paginação (`?porEtapa`) sem número válido. */
export const POR_ETAPA_PADRAO = 30;
export const POR_ETAPA_MAXIMO = 100;

export function lerPorEtapa(bruto: string | null): number {
  const n = Math.floor(Number(bruto));
  return Number.isFinite(n) && n >= 1 ? Math.min(n, POR_ETAPA_MAXIMO) : POR_ETAPA_PADRAO;
}

/** A coluna é ordenada por (position, id): o cursor é o par do último cartão entregue. */
export const ORDEM_DA_COLUNA = [{ position: "asc" }, { id: "asc" }] satisfies Prisma.DealOrderByWithRelationInput[];

export function codificarCursor(d: { position: number; id: string }): string {
  return `${d.position}~${d.id}`;
}

/** null = cursor inválido. */
export function decodificarCursor(texto: string): { position: number; id: string } | null {
  const i = texto.indexOf("~");
  if (i < 1) return null;
  const position = Number(texto.slice(0, i));
  const id = texto.slice(i + 1);
  if (!Number.isInteger(position) || !/^[A-Za-z0-9_-]{1,60}$/.test(id)) return null;
  return { position, id };
}

/** Cartões estritamente depois do cursor, na ordem da coluna (não repete nem pula). */
export function whereDepoisDoCursor(c: { position: number; id: string }): Prisma.DealWhereInput {
  return { OR: [{ position: { gt: c.position } }, { position: c.position, id: { gt: c.id } }] };
}

/** Uma página de uma coluna: até `n` cartões e se há mais. */
export async function paginaDaColuna(
  where: Prisma.DealWhereInput,
  stageId: string,
  n: number,
  depois?: { position: number; id: string } | null
): Promise<{ linhas: LinhaDoCartao[]; temMais: boolean; depois: string | null }> {
  const linhas = await prisma.deal.findMany({
    where: { AND: [where, { stageId }, ...(depois ? [whereDepoisDoCursor(depois)] : [])] },
    include: INCLUDE_CARTAO,
    orderBy: ORDEM_DA_COLUNA,
    take: n + 1,
  });
  const temMais = linhas.length > n;
  const pagina = temMais ? linhas.slice(0, n) : linhas;
  const ultima = pagina[pagina.length - 1];
  return { linhas: pagina, temMais, depois: temMais && ultima ? codificarCursor(ultima) : null };
}

export interface TotaisDaEtapa {
  count: number;
  totalCents: number;
  weightedCents: number;
}

/**
 * Contagem, total e ponderado por etapa, agregados no banco. Ponderado =
 * Σ valor × probabilidade / 100: o groupBy por (etapa, probabilidade) dá a
 * soma de cada faixa de probabilidade, e a conta fecha aqui (arredondada uma
 * vez por faixa, não por negócio — pode diferir alguns centavos da soma
 * cartão a cartão).
 */
export async function totaisPorEtapa(where: Prisma.DealWhereInput): Promise<Map<string, TotaisDaEtapa>> {
  const grupos = await prisma.deal.groupBy({
    by: ["stageId", "probability"],
    where,
    _count: { _all: true },
    _sum: { amountCents: true },
  });
  const mapa = new Map<string, TotaisDaEtapa>();
  for (const g of grupos) {
    const t = mapa.get(g.stageId) ?? { count: 0, totalCents: 0, weightedCents: 0 };
    const soma = g._sum.amountCents ?? 0;
    t.count += g._count._all;
    t.totalCents += soma;
    t.weightedCents += Math.round((soma * g.probability) / 100);
    mapa.set(g.stageId, t);
  }
  return mapa;
}
