import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { diaLocal, inicioDoDia, somarDias } from "@/lib/consulta";

// ---------------------------------------------------------------------------
// "Visão geral" do Dashboard: o mês até hoje, comparado com os mesmos dias do
// mês anterior, numa aba por canal. Contas agregadas no banco; a montagem
// (ritmo, meses, mapa de calor) é pura e testada à parte.
// ---------------------------------------------------------------------------

/** Abas de canal do topo. WhatsApp junta o oficial e o QR. */
export const GRUPOS_DE_CANAL: Record<string, string[]> = {
  whatsapp: ["whatsapp_meta", "whatsapp_qr"],
  website: ["website"],
  instagram: ["instagram"],
  messenger: ["messenger"],
  telegram: ["telegram"],
};
const CANAIS_INTERNOS = ["playground", "builder_preview"];

export interface Mes {
  /** "AAAA-MM" */
  mes: string;
  receita: number;
  vendas: number;
  criados: number;
}

export interface VisaoGeral {
  canal: string;
  canaisComDados: string[];
  periodo: { de: string; ate: string; anteriorDe: string; anteriorAte: string };
  aoVivo: number;
  receita: { atual: number; anterior: number; porDia: number[] };
  vendas: { atual: number; anterior: number; porSemana: number[] };
  conversas: { atual: number; anterior: number; semAtendente: number | null };
  conversao: { atual: number | null; anterior: number | null; porMes: { mes: string; valor: number | null }[] };
  ritmo: { pontos: number; noRitmo: boolean; mediaMensal: number; esperadoAteHoje: number; melhorCanal: { canal: string; parte: number } | null };
  meses: Mes[];
  /** [diaDaSemana 0=domingo][bloco de 2 h] = mensagens de clientes nos últimos 30 dias. */
  calor: number[][];
}

const mesDe = (dia: string) => dia.slice(0, 7);
function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}
const diasNoMes = (mes: string) => new Date(Date.UTC(Number(mes.slice(0, 4)), Number(mes.slice(5, 7)), 0)).getUTCDate();

/**
 * Ritmo do mês: quanto da média mensal (3 meses anteriores) a receita já
 * alcançou, em pontos de 0 a 100. "No ritmo" quando passa do que se espera
 * até o dia de hoje.
 */
export function calcularRitmo(receitaDoMes: number, ultimosTres: number[], diaDoMes: number, totalDeDias: number) {
  const comDados = ultimosTres.filter((v) => v > 0);
  const mediaMensal = comDados.length ? Math.round(comDados.reduce((s, v) => s + v, 0) / comDados.length) : 0;
  const esperadoAteHoje = Math.round((mediaMensal * diaDoMes) / totalDeDias);
  const pontos = mediaMensal > 0 ? Math.min(100, Math.round((receitaDoMes / mediaMensal) * 100)) : receitaDoMes > 0 ? 100 : 0;
  return { pontos, noRitmo: receitaDoMes >= esperadoAteHoje && receitaDoMes > 0, mediaMensal, esperadoAteHoje };
}

/** Meses de `de` até `ate` (inclusive), com zero onde não houve nada. */
export function preencherMeses(linhas: Mes[], de: string, ate: string): Mes[] {
  const porMes = new Map(linhas.map((l) => [l.mes, l]));
  const out: Mes[] = [];
  for (let m = de; m <= ate; m = somarMeses(m, 1)) out.push(porMes.get(m) ?? { mes: m, receita: 0, vendas: 0, criados: 0 });
  return out;
}

/** Grade 7 × 12 (dia da semana × bloco de 2 h) a partir das contagens do banco. */
export function montarCalor(linhas: { dow: number; hora: number; total: number }[]): number[][] {
  const grade = Array.from({ length: 7 }, () => new Array(12).fill(0));
  for (const l of linhas) grade[Number(l.dow) % 7][Math.floor(Number(l.hora) / 2) % 12] += Number(l.total);
  return grade;
}

export async function coletarVisaoGeral(orgId: string, canal: string, agora = new Date()): Promise<VisaoGeral> {
  const canais = GRUPOS_DE_CANAL[canal] ?? null;
  const hoje = diaLocal(agora);
  const mes = mesDe(hoje);
  const diaDoMes = Number(hoje.slice(8, 10));
  const inicioMes = `${mes}-01`;
  // Mesmos dias do mês anterior (dia 31 vira o último dia do mês anterior).
  const mesAnterior = somarMeses(mes, -1);
  const fimAnterior = `${mesAnterior}-${String(Math.min(diaDoMes, diasNoMes(mesAnterior))).padStart(2, "0")}`;
  const desde = inicioDoDia(inicioMes);
  const ate = inicioDoDia(somarDias(hoje, 1));
  const desdeAnterior = inicioDoDia(`${mesAnterior}-01`);
  const ateAnterior = inicioDoDia(somarDias(fimAnterior, 1));
  // Receita por mês: do começo do ano passado até o mês atual.
  const primeiroMes = `${Number(mes.slice(0, 4)) - 1}-01`;

  const doCanal = canais
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM eva_studio_deal_contacts dc JOIN eva_studio_contact_channels ch ON ch."contactId" = dc."contactId"
                  WHERE dc."dealId" = d.id AND ch.channel IN (${Prisma.join(canais)}))`
    : Prisma.empty;
  const conversaDoCanal = canais ? Prisma.sql`AND c.channel IN (${Prisma.join(canais)})` : Prisma.sql`AND c.channel <> ALL(${CANAIS_INTERNOS})`;

  const [ganhosPorDia, porMes, criadosPorMes, conversas, calor, aoVivo, canaisComDados, porCanal] = await Promise.all([
    prisma.$queryRaw<{ dia: string; receita: number; vendas: number }[]>`
      SELECT to_char(d."closedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS dia,
             SUM(d."amountCents")::bigint::float8 AS receita, COUNT(*)::int AS vendas
        FROM eva_studio_deals d JOIN eva_studio_pipeline_stages st ON st.id = d."stageId"
       WHERE d."orgId" = ${orgId} AND st.type = 'won' AND d."archivedAt" IS NULL
         AND d."closedAt" >= ${desdeAnterior} AND d."closedAt" < ${ate} ${doCanal}
       GROUP BY 1`,
    prisma.$queryRaw<{ mes: string; receita: number; vendas: number }[]>`
      SELECT to_char(d."closedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS mes,
             SUM(d."amountCents")::bigint::float8 AS receita, COUNT(*)::int AS vendas
        FROM eva_studio_deals d JOIN eva_studio_pipeline_stages st ON st.id = d."stageId"
       WHERE d."orgId" = ${orgId} AND st.type = 'won' AND d."archivedAt" IS NULL
         AND d."closedAt" >= ${inicioDoDia(`${primeiroMes}-01`)} AND d."closedAt" < ${ate} ${doCanal}
       GROUP BY 1`,
    prisma.$queryRaw<{ mes: string; criados: number }[]>`
      SELECT to_char(d."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS mes, COUNT(*)::int AS criados
        FROM eva_studio_deals d
       WHERE d."orgId" = ${orgId} AND d."archivedAt" IS NULL
         AND d."createdAt" >= ${inicioDoDia(`${primeiroMes}-01`)} AND d."createdAt" < ${ate} ${doCanal}
       GROUP BY 1`,
    prisma.$queryRaw<{ anterior: boolean; total: number; humano: number }[]>`
      SELECT c."createdAt" < ${desde} AS anterior, COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE c.status IN ('waiting_human', 'human'))::int AS humano
        FROM eva_studio_conversations c JOIN eva_studio_agents a ON a.id = c."agentId"
       WHERE a."orgId" = ${orgId} ${conversaDoCanal}
         AND ((c."createdAt" >= ${desde} AND c."createdAt" < ${ate}) OR (c."createdAt" >= ${desdeAnterior} AND c."createdAt" < ${ateAnterior}))
       GROUP BY 1`,
    prisma.$queryRaw<{ dow: number; hora: number; total: number }[]>`
      SELECT EXTRACT(DOW FROM (m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'))::int AS dow,
             EXTRACT(HOUR FROM (m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'))::int AS hora, COUNT(*)::int AS total
        FROM eva_studio_messages m JOIN eva_studio_conversations c ON c.id = m."conversationId"
        JOIN eva_studio_agents a ON a.id = c."agentId"
       WHERE a."orgId" = ${orgId} AND m.role = 'contact' ${conversaDoCanal}
         AND m."createdAt" >= ${new Date(agora.getTime() - 30 * 86_400_000)}
       GROUP BY 1, 2`,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(DISTINCT c.id)::int AS total
        FROM eva_studio_conversations c JOIN eva_studio_agents a ON a.id = c."agentId"
       WHERE a."orgId" = ${orgId} ${conversaDoCanal}
         AND c."lastContactMessageAt" >= ${new Date(agora.getTime() - 15 * 60_000)}`,
    prisma.$queryRaw<{ channel: string }[]>`
      SELECT DISTINCT c.channel FROM eva_studio_conversations c JOIN eva_studio_agents a ON a.id = c."agentId"
       WHERE a."orgId" = ${orgId} AND c.channel <> ALL(${CANAIS_INTERNOS}) AND c."updatedAt" >= ${inicioDoDia(`${primeiroMes}-01`)}`,
    // Melhor canal do mês (só na aba Geral): por onde chegou quem comprou.
    canais
      ? Promise.resolve([] as { canal: string; receita: number }[])
      : prisma.$queryRaw<{ canal: string; receita: number }[]>`
          SELECT canal, SUM(valor)::bigint::float8 AS receita FROM (
            SELECT DISTINCT ch.channel AS canal, d.id, d."amountCents" AS valor
              FROM eva_studio_deals d JOIN eva_studio_pipeline_stages st ON st.id = d."stageId"
              JOIN eva_studio_deal_contacts dc ON dc."dealId" = d.id
              JOIN eva_studio_contact_channels ch ON ch."contactId" = dc."contactId"
             WHERE d."orgId" = ${orgId} AND st.type = 'won' AND d."archivedAt" IS NULL
               AND d."closedAt" >= ${desde} AND d."closedAt" < ${ate}
          ) x GROUP BY 1 ORDER BY 2 DESC LIMIT 1`,
  ]);

  const dias = new Map(ganhosPorDia.map((g) => [g.dia, g]));
  const soma = (de: string, ateDia: string, campo: "receita" | "vendas") => {
    let s = 0;
    for (let d = de; d <= ateDia; d = somarDias(d, 1)) s += Number(dias.get(d)?.[campo] ?? 0);
    return s;
  };
  const porDia: number[] = [];
  for (let d = inicioMes; d <= hoje; d = somarDias(d, 1)) porDia.push(Number(dias.get(d)?.receita ?? 0));
  const porSemana = [0, 0, 0, 0, 0];
  for (let d = inicioMes; d <= hoje; d = somarDias(d, 1)) porSemana[Math.min(4, Math.floor((Number(d.slice(8, 10)) - 1) / 7))] += Number(dias.get(d)?.vendas ?? 0);

  const criados = new Map(criadosPorMes.map((c) => [c.mes, Number(c.criados)]));
  const meses = preencherMeses(
    porMes.map((m) => ({ mes: m.mes, receita: Number(m.receita), vendas: Number(m.vendas), criados: criados.get(m.mes) ?? 0 })),
    primeiroMes,
    mes
  ).map((m) => ({ ...m, criados: criados.get(m.mes) ?? 0 })); // mês com negócio criado e sem venda
  const conv = (m?: Mes) => (m && m.criados > 0 ? m.vendas / m.criados : null);

  const atual = conversas.find((c) => !c.anterior);
  const anterior = conversas.find((c) => c.anterior);
  const receitaAtual = soma(inicioMes, hoje, "receita");
  const ritmo = calcularRitmo(
    receitaAtual,
    [1, 2, 3].map((n) => meses.find((m) => m.mes === somarMeses(mes, -n))?.receita ?? 0),
    diaDoMes,
    diasNoMes(mes)
  );
  const melhor = porCanal[0];

  return {
    canal: canais ? canal : "",
    canaisComDados: Object.keys(GRUPOS_DE_CANAL).filter((g) => GRUPOS_DE_CANAL[g].some((c) => canaisComDados.some((x) => x.channel === c))),
    periodo: { de: inicioMes, ate: hoje, anteriorDe: `${mesAnterior}-01`, anteriorAte: fimAnterior },
    aoVivo: Number(aoVivo[0]?.total ?? 0),
    receita: { atual: receitaAtual, anterior: soma(`${mesAnterior}-01`, fimAnterior, "receita"), porDia },
    vendas: { atual: soma(inicioMes, hoje, "vendas"), anterior: soma(`${mesAnterior}-01`, fimAnterior, "vendas"), porSemana: porSemana.slice(0, Math.ceil(diaDoMes / 7)) },
    conversas: {
      atual: Number(atual?.total ?? 0),
      anterior: Number(anterior?.total ?? 0),
      semAtendente: atual && Number(atual.total) > 0 ? 1 - Number(atual.humano) / Number(atual.total) : null,
    },
    conversao: {
      atual: conv(meses.at(-1)),
      anterior: conv(meses.at(-2)),
      porMes: meses.slice(-6).map((m) => ({ mes: m.mes, valor: conv(m) })),
    },
    ritmo: {
      ...ritmo,
      melhorCanal: melhor && receitaAtual > 0 ? { canal: melhor.canal, parte: Math.min(1, Number(melhor.receita) / receitaAtual) } : null,
    },
    meses,
    calor: montarCalor(calor),
  };
}
