import "server-only";
import { prisma } from "@/lib/db/prisma";

// ---------------------------------------------------------------------------
// Catálogo de fontes do Dashboard.
//
// O painel é montado pela pessoa: ela escolhe um cartão, escolhe uma fonte e
// dá um nome. Para isso funcionar sem virar um zoológico de rotas, existe UM
// lugar que calcula tudo e devolve por chave. Cartão novo não pede rota nova;
// fonte nova aparece sozinha na lista de escolha.
//
// A regra do que entra aqui: número que sai de tabela. Nada de estimativa,
// nada de "simulado" — se não dá pra contar, não vira fonte.
// ---------------------------------------------------------------------------

const DIA = 24 * 60 * 60 * 1000;
const CANAIS_INTERNOS = ["playground", "builder_preview"];

export { FONTES, FONTE_POR_CHAVE } from "@/lib/analytics-catalog";
export type { TipoDeFonte, DefinicaoDeFonte } from "@/lib/analytics-catalog";

export interface Ponto { label: string; value: number }
export interface LinhaDeTabela {
  id: string;
  quando: string | null;
  titulo: string;
  contato: string;
  responsavel: string;
  valorCents: number;
}

export interface Fontes {
  numeros: Record<string, number | null>;
  series: Record<string, Ponto[]>;
  quebras: Record<string, Ponto[]>;
  tabelas: Record<string, LinhaDeTabela[]>;
}

export async function coletarFontes(orgId: string, dias: number): Promise<Fontes> {
  const desde = new Date();
  desde.setHours(0, 0, 0, 0);
  desde.setTime(desde.getTime() - (dias - 1) * DIA);

  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  const [ganhos, criados, abertos, recentes, canalVendas, conversas, mensagens, porHora] =
    await Promise.all([
      prisma.deal.findMany({
        where: { orgId, closedAt: { gte: desde }, stage: { type: "won" } },
        select: { amountCents: true, closedAt: true },
      }),
      prisma.deal.count({ where: { orgId, createdAt: { gte: desde } } }),
      prisma.deal.findMany({
        where: { orgId, closedAt: null, archivedAt: null },
        select: { amountCents: true, probability: true, stage: { select: { name: true, position: true } } },
      }),
      prisma.deal.findMany({
        where: { orgId, closedAt: { gte: desde }, stage: { type: "won" } },
        include: {
          owner: { select: { name: true } },
          contacts: { take: 1, include: { contact: { select: { name: true, phone: true } } } },
        },
        orderBy: { closedAt: "desc" },
        take: 15,
      }),
      prisma.$queryRaw<{ canal: string; total: number }[]>`
        SELECT COALESCE(ch.channel, 'sem canal') AS canal, COUNT(DISTINCT d.id)::int AS total
          FROM eva_studio_deals d
          JOIN eva_studio_pipeline_stages st ON st.id = d."stageId"
          LEFT JOIN eva_studio_deal_contacts dc ON dc."dealId" = d.id
          LEFT JOIN eva_studio_contact_channels ch ON ch."contactId" = dc."contactId"
         WHERE d."orgId" = ${orgId} AND st.type = 'won' AND d."closedAt" >= ${desde}
         GROUP BY 1 ORDER BY 2 DESC
      `,
      prisma.conversation.findMany({
        where: { agent: { orgId }, updatedAt: { gte: desde }, channel: { notIn: CANAIS_INTERNOS } },
        select: { channel: true, status: true },
      }),
      prisma.message.count({
        where: {
          role: "contact",
          createdAt: { gte: desde },
          conversation: { agent: { orgId }, channel: { notIn: CANAIS_INTERNOS } },
        },
      }),
      prisma.$queryRaw<{ hora: number; total: number }[]>`
        SELECT EXTRACT(HOUR FROM (m."createdAt" AT TIME ZONE 'America/Sao_Paulo'))::int AS hora,
               COUNT(*)::int AS total
          FROM eva_studio_messages m
          JOIN eva_studio_conversations c ON c.id = m."conversationId"
          JOIN eva_studio_agents a ON a.id = c."agentId"
         WHERE a."orgId" = ${orgId} AND m.role = 'contact'
           AND c.channel <> ALL(${CANAIS_INTERNOS})
           AND m."createdAt" >= ${desde}
         GROUP BY 1
      `,
    ]);

  const receita = ganhos.reduce((s, d) => s + d.amountCents, 0);
  const deHoje = ganhos.filter((d) => d.closedAt && d.closedAt >= hoje);
  const escalaram = conversas.filter((c) => c.status === "waiting_human").length;

  // Baldes fixos: dia sem venda tem que aparecer como zero, senão a linha
  // "pula" o dia ruim e o gráfico mente pra quem olha rápido.
  const porDia = new Map<string, number>();
  for (let i = 0; i < dias; i += 1) {
    porDia.set(new Date(desde.getTime() + i * DIA).toISOString().slice(0, 10), 0);
  }
  for (const d of ganhos) {
    if (!d.closedAt) continue;
    const k = d.closedAt.toISOString().slice(0, 10);
    if (porDia.has(k)) porDia.set(k, (porDia.get(k) ?? 0) + d.amountCents);
  }

  const etapas = new Map<string, { valor: number; posicao: number }>();
  for (const d of abertos) {
    const atual = etapas.get(d.stage.name) ?? { valor: 0, posicao: d.stage.position };
    atual.valor += d.amountCents;
    etapas.set(d.stage.name, atual);
  }

  const canaisConversa = new Map<string, number>();
  for (const c of conversas) canaisConversa.set(c.channel, (canaisConversa.get(c.channel) ?? 0) + 1);

  return {
    numeros: {
      vendas: ganhos.length,
      receita: receita,
      ticket: ganhos.length ? Math.round(receita / ganhos.length) : 0,
      vendasHoje: deHoje.length,
      receitaHoje: deHoje.reduce((s, d) => s + d.amountCents, 0),
      // null e não 0: "não houve negócio para converter" é diferente de
      // "houve e nenhum converteu", e a tela sabe dizer os dois.
      conversao: criados > 0 ? ganhos.length / criados : null,
      emAberto: abertos.reduce((s, d) => s + d.amountCents, 0),
      emAbertoPonderado: abertos.reduce((s, d) => s + Math.round((d.amountCents * d.probability) / 100), 0),
      negociosAbertos: abertos.length,
      conversas: conversas.length,
      autonomia: conversas.length > 0 ? 1 - escalaram / conversas.length : null,
      esperandoHumano: escalaram,
      mensagens,
    },
    series: {
      receitaPorDia: Array.from(porDia.entries()).map(([data, cents]) => ({
        label: new Date(data).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        value: Math.round(cents / 100),
      })),
      conversasPorHora: Array.from({ length: 24 }, (_, h) => ({
        label: `${String(h).padStart(2, "0")}h`,
        value: Number(porHora.find((p) => Number(p.hora) === h)?.total ?? 0),
      })),
    },
    quebras: {
      porEtapa: Array.from(etapas.entries())
        .sort((a, b) => a[1].posicao - b[1].posicao)
        .map(([label, v]) => ({ label, value: Math.round(v.valor / 100) })),
      porCanalVendas: canalVendas.map((c) => ({ label: c.canal, value: Number(c.total) })),
      porCanalConversas: Array.from(canaisConversa.entries())
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value),
    },
    tabelas: {
      vendasRecentes: recentes.map((d) => ({
        id: d.id,
        quando: d.closedAt?.toISOString() ?? null,
        titulo: d.name,
        contato: d.contacts[0]?.contact.name || d.contacts[0]?.contact.phone || "—",
        responsavel: d.owner?.name ?? "—",
        valorCents: d.amountCents,
      })),
    },
  };
}
