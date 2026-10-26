import "server-only";
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@/generated/prisma/client";
import { CANAIS_DE_TESTE } from "@/lib/server/conversas";

// ---------------------------------------------------------------------------
// Relatório do Studio (aba Relatórios do builder), a partir de
// eva_studio_studio_events. Funil por Bloco conta conversas distintas: quem
// passa duas vezes pelo mesmo Bloco conta uma.
// ---------------------------------------------------------------------------

export interface FiltroDoRelatorio {
  agentId: string;
  /** Início e fim (exclusivo) do período. */
  from: Date;
  to: Date;
  /** "" = todos os canais reais (sem os de teste); "test" = só os de teste; senão, o canal. */
  channel: string;
}

export interface LinhaDoFunil {
  nodeId: string;
  label: string;
  entered: number;
  /** Conversas que seguiram por alguma saída (cada uma conta uma vez). */
  exited: number;
  noReply: number;
  /** Entraram e não seguiram nem saíram por prazo (ainda esperando ou desistiram). */
  stopped: number;
  exits: { label: string; count: number }[];
  buttons: { label: string; count: number }[];
}

export interface Relatorio {
  funnel: LinhaDoFunil[];
  events: { category: string; action: string; count: number; conversations: number }[];
  channels: string[];
}

type Contagem = { nodeId: string | null; action: string; value: string | null; n: number };

/**
 * Junta as contagens no formato da tela. Blocos na ordem do fluxo; bloco sem
 * nenhum evento no período fica de fora.
 */
export function montarFunil(contagens: Contagem[], nos: { id: string; label: string; iconKey?: string }[]): LinhaDoFunil[] {
  const porNo = new Map<string, LinhaDoFunil>();
  const linha = (nodeId: string) => {
    let l = porNo.get(nodeId);
    if (!l) {
      const no = nos.find((n) => n.id === nodeId);
      l = { nodeId, label: no?.label || "Bloco apagado", entered: 0, exited: 0, noReply: 0, stopped: 0, exits: [], buttons: [] };
      porNo.set(nodeId, l);
    }
    return l;
  };
  for (const c of contagens) {
    if (!c.nodeId) continue;
    const l = linha(c.nodeId);
    if (c.action === "entered") l.entered += c.n;
    else if (c.action === "no_reply") l.noReply += c.n;
    else if (c.action === "exited_any") l.exited += c.n;
    else if (c.action === "exited") l.exits.push({ label: c.value ?? "Padrão", count: c.n });
    else if (c.action === "clicked") l.buttons.push({ label: c.value ?? "", count: c.n });
  }
  const ordem = new Map(nos.map((n, i) => [n.id, i]));
  return [...porNo.values()]
    .map((l) => ({
      ...l,
      stopped: Math.max(0, l.entered - Math.min(l.exited, l.entered) - l.noReply),
      exits: l.exits.sort((a, b) => b.count - a.count),
      buttons: l.buttons.sort((a, b) => b.count - a.count),
    }))
    .sort((a, b) => (ordem.get(a.nodeId) ?? 1e9) - (ordem.get(b.nodeId) ?? 1e9));
}

function filtroDeCanal(channel: string): Prisma.Sql {
  if (channel === "test") return Prisma.sql`AND "channel" = ANY(${CANAIS_DE_TESTE})`;
  if (channel) return Prisma.sql`AND "channel" = ${channel}`;
  return Prisma.sql`AND ("channel" IS NULL OR NOT ("channel" = ANY(${CANAIS_DE_TESTE})))`;
}

export async function gerarRelatorio(f: FiltroDoRelatorio, nos: { id: string; label: string }[]): Promise<Relatorio> {
  const canal = filtroDeCanal(f.channel);
  const periodo = Prisma.sql`"agentId" = ${f.agentId} AND "createdAt" >= ${f.from} AND "createdAt" < ${f.to}`;

  const [doFunil, eventos, canais] = await Promise.all([
    prisma.$queryRaw<Contagem[]>`
      SELECT "nodeId", "action", CASE WHEN "action" IN ('exited', 'clicked') THEN "value" END AS "value",
             COUNT(DISTINCT "conversationId")::int AS n
      FROM "eva_studio_studio_events"
      WHERE ${periodo} ${canal} AND "category" IN ('block', 'button')
      GROUP BY 1, 2, 3
      UNION ALL
      SELECT "nodeId", 'exited_any', NULL, COUNT(DISTINCT "conversationId")::int
      FROM "eva_studio_studio_events"
      WHERE ${periodo} ${canal} AND "category" = 'block' AND "action" = 'exited'
      GROUP BY 1`,
    prisma.$queryRaw<{ category: string; action: string; count: number; conversations: number }[]>`
      SELECT "category", "action", COUNT(*)::int AS count, COUNT(DISTINCT "conversationId")::int AS conversations
      FROM "eva_studio_studio_events"
      WHERE ${periodo} ${canal} AND "category" NOT IN ('block', 'button')
      GROUP BY 1, 2
      ORDER BY 3 DESC
      LIMIT 200`,
    prisma.$queryRaw<{ channel: string }[]>`
      SELECT DISTINCT "channel" FROM "eva_studio_studio_events"
      WHERE ${periodo} AND "channel" IS NOT NULL
      ORDER BY 1`,
  ]);

  return { funnel: montarFunil(doFunil, nos), events: eventos, channels: canais.map((c) => c.channel) };
}
