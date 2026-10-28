import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { diaLocal, diasEntre, inicioDoDia, janelaAnterior, janelaDoPainel, somarDias, type FiltrosGlobais } from "@/lib/consulta";
import { sqlGlobal } from "@/lib/server/analytics";

// ---------------------------------------------------------------------------
// Cartões da "Visão geral" do Dashboard: o período da barra comparado com o
// período anterior de mesmo tamanho, filtrado por canal, funis e
// responsáveis. Contas agregadas no banco; a montagem (ritmo, meses, mapa de
// calor) é pura e testada à parte.
// ---------------------------------------------------------------------------

/** Filtro "Canal" da barra. WhatsApp junta o oficial e o QR. */
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

export interface Ritmo {
  pontos: number;
  noRitmo: boolean;
  /** Média de receita dos 3 períodos anteriores de mesmo tamanho. */
  referencia: number;
  esperadoAteHoje: number;
  /** Receita até hoje esticada até o fim do período. */
  projetada: number;
}

export interface VisaoGeral {
  canal: string;
  canaisComDados: string[];
  periodo: { de: string; ate: string; anteriorDe: string; anteriorAte: string };
  aoVivo: number;
  receita: { atual: number; anterior: number; porDia: number[] };
  vendas: { atual: number; anterior: number; porDia: number[] };
  conversas: { atual: number; anterior: number; semAtendente: number | null };
  conversao: { atual: number | null; anterior: number | null; porMes: { mes: string; valor: number | null }[] };
  /** null quando o período não inclui hoje. */
  ritmo: (Ritmo & { melhorCanal: { canal: string; parte: number } | null }) | null;
  meses: Mes[];
  /** [diaDaSemana 0=domingo][bloco de 2 h] = mensagens de clientes no período. */
  calor: number[][];
}

const mesDe = (dia: string) => dia.slice(0, 7);
function somarMeses(mes: string, n: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/**
 * Ritmo do período: a receita até hoje, projetada até o fim do período,
 * contra a média dos 3 períodos anteriores de mesmo tamanho, em pontos de 0
 * a 100. "No ritmo" quando a receita até hoje passa do que a média pede para
 * os dias já corridos.
 */
export function calcularRitmo(receitaAteHoje: number, referencias: number[], decorridos: number, total: number): Ritmo {
  const comDados = referencias.filter((v) => v > 0);
  const referencia = comDados.length ? Math.round(comDados.reduce((s, v) => s + v, 0) / comDados.length) : 0;
  const projetada = Math.round((receitaAteHoje * total) / Math.max(1, decorridos));
  const esperadoAteHoje = Math.round((referencia * decorridos) / total);
  const pontos = referencia > 0 ? Math.min(100, Math.round((projetada / referencia) * 100)) : receitaAteHoje > 0 ? 100 : 0;
  return { pontos, noRitmo: receitaAteHoje > 0 && receitaAteHoje >= esperadoAteHoje, referencia, esperadoAteHoje, projetada };
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

export async function coletarVisaoGeral(orgId: string, canal: string, g: FiltrosGlobais, agora = new Date()): Promise<VisaoGeral> {
  const canais = GRUPOS_DE_CANAL[canal] ?? null;
  const hoje = diaLocal(agora);
  const mes = mesDe(hoje);
  const janela = janelaDoPainel(g.dias, g.de, g.ate, agora);
  const anterior = janelaAnterior(janela);
  const tamanho = diasEntre(janela.de, janela.ate);
  // O ritmo compara com os 3 períodos anteriores: a receita por dia vem desde lá.
  const inicioReferencia = somarDias(janela.de, -3 * tamanho);
  const desde = inicioDoDia(janela.de);
  const ate = inicioDoDia(somarDias(janela.ate, 1));
  const desdeAnterior = inicioDoDia(anterior.de);
  // Receita por mês: do começo do ano passado até o mês atual.
  const primeiroMes = `${Number(mes.slice(0, 4)) - 1}-01`;
  const fimDosMeses = inicioDoDia(somarDias(hoje, 1));

  const doCanal = canais
    ? Prisma.sql`AND EXISTS (SELECT 1 FROM eva_studio_deal_contacts dc JOIN eva_studio_contact_channels ch ON ch."contactId" = dc."contactId"
                  WHERE dc."dealId" = d.id AND ch.channel IN (${Prisma.join(canais)}))`
    : Prisma.empty;
  const doPainel = sqlGlobal(g);
  const conversaDoCanal = canais ? Prisma.sql`AND c.channel IN (${Prisma.join(canais)})` : Prisma.sql`AND c.channel <> ALL(${CANAIS_INTERNOS})`;

  const [ganhosPorDia, porMes, criadosPorMes, criados, conversas, calor, aoVivo, canaisComDados, porCanal] = await Promise.all([
    prisma.$queryRaw<{ dia: string; receita: number; vendas: number }[]>`
      SELECT to_char(d."closedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS dia,
             SUM(d."amountCents")::bigint::float8 AS receita, COUNT(*)::int AS vendas
        FROM eva_studio_deals d JOIN eva_studio_pipeline_stages st ON st.id = d."stageId"
       WHERE d."orgId" = ${orgId} AND st.type = 'won' AND d."archivedAt" IS NULL
         AND d."closedAt" >= ${inicioDoDia(inicioReferencia)} AND d."closedAt" < ${ate} ${doCanal} ${doPainel}
       GROUP BY 1`,
    prisma.$queryRaw<{ mes: string; receita: number; vendas: number }[]>`
      SELECT to_char(d."closedAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS mes,
             SUM(d."amountCents")::bigint::float8 AS receita, COUNT(*)::int AS vendas
        FROM eva_studio_deals d JOIN eva_studio_pipeline_stages st ON st.id = d."stageId"
       WHERE d."orgId" = ${orgId} AND st.type = 'won' AND d."archivedAt" IS NULL
         AND d."closedAt" >= ${inicioDoDia(`${primeiroMes}-01`)} AND d."closedAt" < ${fimDosMeses} ${doCanal} ${doPainel}
       GROUP BY 1`,
    prisma.$queryRaw<{ mes: string; criados: number }[]>`
      SELECT to_char(d."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') AS mes, COUNT(*)::int AS criados
        FROM eva_studio_deals d
       WHERE d."orgId" = ${orgId} AND d."archivedAt" IS NULL
         AND d."createdAt" >= ${inicioDoDia(`${primeiroMes}-01`)} AND d."createdAt" < ${fimDosMeses} ${doCanal} ${doPainel}
       GROUP BY 1`,
    prisma.$queryRaw<{ anterior: boolean; total: number }[]>`
      SELECT d."createdAt" < ${desde} AS anterior, COUNT(*)::int AS total
        FROM eva_studio_deals d
       WHERE d."orgId" = ${orgId} AND d."archivedAt" IS NULL
         AND d."createdAt" >= ${desdeAnterior} AND d."createdAt" < ${ate} ${doCanal} ${doPainel}
       GROUP BY 1`,
    prisma.$queryRaw<{ anterior: boolean; total: number; humano: number }[]>`
      SELECT c."createdAt" < ${desde} AS anterior, COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE c.status IN ('waiting_human', 'human'))::int AS humano
        FROM eva_studio_conversations c JOIN eva_studio_agents a ON a.id = c."agentId"
       WHERE a."orgId" = ${orgId} ${conversaDoCanal}
         AND c."createdAt" >= ${desdeAnterior} AND c."createdAt" < ${ate}
       GROUP BY 1`,
    prisma.$queryRaw<{ dow: number; hora: number; total: number }[]>`
      SELECT EXTRACT(DOW FROM (m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'))::int AS dow,
             EXTRACT(HOUR FROM (m."createdAt" AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo'))::int AS hora, COUNT(*)::int AS total
        FROM eva_studio_messages m JOIN eva_studio_conversations c ON c.id = m."conversationId"
        JOIN eva_studio_agents a ON a.id = c."agentId"
       WHERE a."orgId" = ${orgId} AND m.role = 'contact' ${conversaDoCanal}
         AND m."createdAt" >= ${desde} AND m."createdAt" < ${ate}
       GROUP BY 1, 2`,
    prisma.$queryRaw<{ total: number }[]>`
      SELECT COUNT(DISTINCT c.id)::int AS total
        FROM eva_studio_conversations c JOIN eva_studio_agents a ON a.id = c."agentId"
       WHERE a."orgId" = ${orgId} ${conversaDoCanal}
         AND c."lastContactMessageAt" >= ${new Date(agora.getTime() - 15 * 60_000)}`,
    prisma.$queryRaw<{ channel: string }[]>`
      SELECT DISTINCT c.channel FROM eva_studio_conversations c JOIN eva_studio_agents a ON a.id = c."agentId"
       WHERE a."orgId" = ${orgId} AND c.channel <> ALL(${CANAIS_INTERNOS}) AND c."updatedAt" >= ${inicioDoDia(`${primeiroMes}-01`)}`,
    // Melhor canal do período (só sem filtro de canal): por onde chegou quem comprou.
    canais
      ? Promise.resolve([] as { canal: string; receita: number }[])
      : prisma.$queryRaw<{ canal: string; receita: number }[]>`
          SELECT canal, SUM(valor)::bigint::float8 AS receita FROM (
            SELECT DISTINCT ch.channel AS canal, d.id, d."amountCents" AS valor
              FROM eva_studio_deals d JOIN eva_studio_pipeline_stages st ON st.id = d."stageId"
              JOIN eva_studio_deal_contacts dc ON dc."dealId" = d.id
              JOIN eva_studio_contact_channels ch ON ch."contactId" = dc."contactId"
             WHERE d."orgId" = ${orgId} AND st.type = 'won' AND d."archivedAt" IS NULL
               AND d."closedAt" >= ${desde} AND d."closedAt" < ${ate} ${doPainel}
          ) x GROUP BY 1 ORDER BY 2 DESC LIMIT 1`,
  ]);

  const dias = new Map(ganhosPorDia.map((d) => [d.dia, d]));
  const soma = (de: string, ateDia: string, campo: "receita" | "vendas") => {
    let s = 0;
    for (let d = de; d <= ateDia; d = somarDias(d, 1)) s += Number(dias.get(d)?.[campo] ?? 0);
    return s;
  };
  // Baldes fixos (dia sem venda é zero), até 400 dias como as outras fontes.
  const diasDaJanela: string[] = [];
  for (let d = janela.de; d <= janela.ate && diasDaJanela.length < 400; d = somarDias(d, 1)) diasDaJanela.push(d);

  const criadosNoMes = new Map(criadosPorMes.map((c) => [c.mes, Number(c.criados)]));
  const meses = preencherMeses(
    porMes.map((m) => ({ mes: m.mes, receita: Number(m.receita), vendas: Number(m.vendas), criados: 0 })),
    primeiroMes,
    mes
  ).map((m) => ({ ...m, criados: criadosNoMes.get(m.mes) ?? 0 })); // mês com negócio criado e sem venda
  const conv = (m?: Mes) => (m && m.criados > 0 ? m.vendas / m.criados : null);

  const receitaAtual = soma(janela.de, janela.ate, "receita");
  const vendasAtual = soma(janela.de, janela.ate, "vendas");
  const vendasAnterior = soma(anterior.de, anterior.ate, "vendas");
  const criadosAtual = Number(criados.find((c) => !c.anterior)?.total ?? 0);
  const criadosAnterior = Number(criados.find((c) => c.anterior)?.total ?? 0);
  const conversasAtual = conversas.find((c) => !c.anterior);
  const conversasAnterior = conversas.find((c) => c.anterior);

  const incluiHoje = janela.de <= hoje && hoje <= janela.ate;
  const referencias = [1, 2, 3].map((k) =>
    soma(somarDias(janela.de, -k * tamanho), somarDias(janela.de, -(k - 1) * tamanho - 1), "receita")
  );
  const melhor = porCanal[0];

  return {
    canal: canais ? canal : "",
    canaisComDados: Object.keys(GRUPOS_DE_CANAL).filter((k) => GRUPOS_DE_CANAL[k].some((c) => canaisComDados.some((x) => x.channel === c))),
    periodo: { de: janela.de, ate: janela.ate, anteriorDe: anterior.de, anteriorAte: anterior.ate },
    aoVivo: Number(aoVivo[0]?.total ?? 0),
    receita: {
      atual: receitaAtual,
      anterior: soma(anterior.de, anterior.ate, "receita"),
      porDia: diasDaJanela.map((d) => Number(dias.get(d)?.receita ?? 0)),
    },
    vendas: { atual: vendasAtual, anterior: vendasAnterior, porDia: diasDaJanela.map((d) => Number(dias.get(d)?.vendas ?? 0)) },
    conversas: {
      atual: Number(conversasAtual?.total ?? 0),
      anterior: Number(conversasAnterior?.total ?? 0),
      semAtendente:
        conversasAtual && Number(conversasAtual.total) > 0 ? 1 - Number(conversasAtual.humano) / Number(conversasAtual.total) : null,
    },
    conversao: {
      atual: criadosAtual > 0 ? vendasAtual / criadosAtual : null,
      anterior: criadosAnterior > 0 ? vendasAnterior / criadosAnterior : null,
      porMes: meses.slice(-6).map((m) => ({ mes: m.mes, valor: conv(m) })),
    },
    ritmo: incluiHoje
      ? {
          ...calcularRitmo(soma(janela.de, hoje, "receita"), referencias, diasEntre(janela.de, hoje), tamanho),
          melhorCanal: melhor && receitaAtual > 0 ? { canal: melhor.canal, parte: Math.min(1, Number(melhor.receita) / receitaAtual) } : null,
        }
      : null,
    meses,
    calor: montarCalor(calor),
  };
}
