import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { coletarFunil } from "@/lib/server/funil-dados";
import type { LinhaDeConversao } from "@/lib/funil-metricas";
import {
  FILTROS_GLOBAIS_PADRAO,
  SEM_VALOR,
  diaLocal,
  diasEntre,
  inicioDoDia,
  janelaDoPainel,
  somarDias,
  type FiltrosGlobais,
} from "@/lib/consulta";

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
//
// Filtros globais da barra do painel: o período vale pra tudo; funis e
// responsável valem pras fontes de negócio (ver `filtros` no catálogo). As
// de atendimento não são de negócio e ignoram os dois.
// ---------------------------------------------------------------------------

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
  /** Só nas tabelas de funil (negócios parados). */
  etapa?: string;
}

export interface Fontes {
  numeros: Record<string, number | null>;
  series: Record<string, Ponto[]>;
  quebras: Record<string, Ponto[]>;
  tabelas: Record<string, LinhaDeTabela[]>;
  funis: Record<string, LinhaDeConversao[]>;
  /** Desde quando existe histórico de etapas (para a tela avisar). */
  historicoDesde: string | null;
  /** Funil usado pelas fontes de um funil só (conversão, dias por etapa...). */
  funilDasFontesDeFunil: { id: string; name: string } | null;
  /** O período efetivo, em dias de São Paulo. */
  periodo: { de: string; ate: string };
}

/** Funis e responsáveis escolhidos na barra, como `where` de negócio. */
function whereGlobal(g: FiltrosGlobais): Prisma.DealWhereInput[] {
  const e: Prisma.DealWhereInput[] = [];
  if (g.funis.length) e.push({ pipelineId: { in: g.funis } });
  if (g.donos.length) {
    const ids = g.donos.filter((d) => d !== SEM_VALOR);
    const ou: Prisma.DealWhereInput[] = [];
    if (ids.length) ou.push({ ownerId: { in: ids } });
    if (g.donos.includes(SEM_VALOR)) ou.push({ ownerId: null });
    e.push({ OR: ou });
  }
  return e;
}

/** O mesmo, em SQL, pra consulta crua de canais. Valores vão como parâmetro, nunca no texto. */
export function sqlGlobal(g: FiltrosGlobais): Prisma.Sql {
  const partes: Prisma.Sql[] = [];
  if (g.funis.length) partes.push(Prisma.sql`AND d."pipelineId" IN (${Prisma.join(g.funis)})`);
  if (g.donos.length) {
    const ids = g.donos.filter((d) => d !== SEM_VALOR);
    const ou: Prisma.Sql[] = [];
    if (ids.length) ou.push(Prisma.sql`d."ownerId" IN (${Prisma.join(ids)})`);
    if (g.donos.includes(SEM_VALOR)) ou.push(Prisma.sql`d."ownerId" IS NULL`);
    partes.push(Prisma.sql`AND (${Prisma.join(ou, " OR ")})`);
  }
  return partes.length ? Prisma.join(partes, " ") : Prisma.empty;
}

/**
 * `filtros` aceita um número (dias, como antes) ou os filtros globais da
 * barra do painel.
 */
export async function coletarFontes(orgId: string, filtros: number | FiltrosGlobais, agora = new Date()): Promise<Fontes> {
  const g: FiltrosGlobais = typeof filtros === "number" ? { ...FILTROS_GLOBAIS_PADRAO, dias: filtros } : filtros;
  const janela = janelaDoPainel(g.dias, g.de, g.ate, agora);
  // Dias de São Paulo, não do relógio do servidor (que roda em UTC).
  const desde = inicioDoDia(janela.de);
  const fim = inicioDoDia(somarDias(janela.ate, 1));
  const hoje = inicioDoDia(diaLocal(agora));
  const periodo = { gte: desde, lt: fim };
  const doPainel = whereGlobal(g);
  const comGlobais = (w: Prisma.DealWhereInput): Prisma.DealWhereInput => (doPainel.length ? { ...w, AND: doPainel } : w);

  const [ganhos, deHoje, criados, abertos, recentes, canalVendas, conversas, mensagens, porHora, funil] =
    await Promise.all([
      prisma.deal.findMany({
        where: comGlobais({ orgId, archivedAt: null, closedAt: periodo, stage: { type: "won" } }),
        select: { amountCents: true, closedAt: true },
      }),
      // "De hoje" não depende do período escolhido: um intervalo no passado não zera a venda de hoje.
      prisma.deal.findMany({
        where: comGlobais({ orgId, archivedAt: null, closedAt: { gte: hoje }, stage: { type: "won" } }),
        select: { amountCents: true },
      }),
      prisma.deal.count({ where: comGlobais({ orgId, archivedAt: null, createdAt: periodo }) }),
      prisma.deal.findMany({
        where: comGlobais({ orgId, closedAt: null, archivedAt: null }),
        select: { amountCents: true, probability: true, stage: { select: { name: true, position: true } } },
      }),
      prisma.deal.findMany({
        where: comGlobais({ orgId, archivedAt: null, closedAt: periodo, stage: { type: "won" } }),
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
         WHERE d."orgId" = ${orgId} AND st.type = 'won' AND d."archivedAt" IS NULL
           AND d."closedAt" >= ${desde} AND d."closedAt" < ${fim}
           ${sqlGlobal(g)}
         GROUP BY 1 ORDER BY 2 DESC
      `,
      prisma.conversation.findMany({
        where: { agent: { orgId }, updatedAt: periodo, channel: { notIn: CANAIS_INTERNOS } },
        select: { channel: true, status: true },
      }),
      prisma.message.count({
        where: {
          role: "contact",
          createdAt: periodo,
          conversation: { agent: { orgId }, channel: { notIn: CANAIS_INTERNOS } },
        },
      }),
      prisma.$queryRaw<{ hora: number; total: number }[]>`
        SELECT EXTRACT(HOUR FROM (m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'))::int AS hora,
               COUNT(*)::int AS total
          FROM eva_studio_messages m
          JOIN eva_studio_conversations c ON c.id = m."conversationId"
          JOIN eva_studio_agents a ON a.id = c."agentId"
         WHERE a."orgId" = ${orgId} AND m.role = 'contact'
           AND c.channel <> ALL(${CANAIS_INTERNOS})
           AND m."createdAt" >= ${desde} AND m."createdAt" < ${fim}
         GROUP BY 1
      `,
      // As fontes de funil são de UM funil (as etapas são dele): com um só
      // escolhido na barra, é esse; senão, o padrão.
      coletarFunil(orgId, desde, agora, g.funis.length === 1 ? g.funis[0] : undefined, { donos: g.donos, ate: fim }),
    ]);

  const receita = ganhos.reduce((s, d) => s + d.amountCents, 0);
  // Duas perguntas diferentes: "quantas precisaram de gente" (conta quem esta
  // com um atendente tambem) e "quantas esperam gente agora" (so as paradas).
  const escalaram = conversas.filter((c) => c.status === "waiting_human" || c.status === "human").length;
  const esperandoAgora = conversas.filter((c) => c.status === "waiting_human").length;

  // Baldes fixos: dia sem venda tem que aparecer como zero, senão a linha
  // "pula" o dia ruim e o gráfico mente pra quem olha rápido. O dia é o de
  // São Paulo: venda das 22h não pode cair no dia seguinte.
  const porDia = new Map<string, number>();
  const totalDeDias = Math.min(diasEntre(janela.de, janela.ate), 400);
  for (let i = 0; i < totalDeDias; i += 1) porDia.set(somarDias(janela.de, i), 0);
  for (const d of ganhos) {
    if (!d.closedAt) continue;
    const k = diaLocal(d.closedAt);
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
      esperandoHumano: esperandoAgora,
      mensagens,
      ...funil.numeros,
    },
    series: {
      receitaPorDia: Array.from(porDia.entries()).map(([dia, cents]) => ({
        label: `${dia.slice(8, 10)}/${dia.slice(5, 7)}`,
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
      ...funil.quebras,
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
      ...funil.tabelas,
    },
    funis: funil.funis,
    historicoDesde: funil.historicoDesde?.toISOString() ?? null,
    funilDasFontesDeFunil: funil.funil ?? null,
    periodo: janela,
  };
}
