import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { numeroDoDestino, paraCsv } from "@/lib/disparos/situacao";
import { qualidadeDoChip } from "@/lib/disparos/qualidade";
import { ROTULO_DA_METRICA, METRICAS, diasDoPeriodo, periodo, seriePorDia, somar, taxa, variacao, type Totais } from "@/lib/disparos/relatorio";

// Relatório de disparos do contrato (tela Relatórios do app de disparos).
// GET ?dias=7|30|90 (padrão 7)  &format=csv → arquivo com a série por dia.
// Tudo conta itens da fila de saída que vieram de disparo (broadcastId).
// Cada métrica conta no dia do seu evento: enviado no sentAt, entregue no
// deliveredAt, lido no readAt, respondeu no repliedAt, falha no createdAt.

type Linha = { metrica: string; dia: string; total: bigint };

async function porDia(orgId: string, de: Date, ate: Date): Promise<Linha[]> {
  // timestamp sem fuso (UTC) → dia de Brasília
  return prisma.$queryRaw<Linha[]>`
    with q as (
      select o.* from eva_studio_outbound_queue o
      join eva_studio_agents a on a.id = o."agentId"
      where a."orgId" = ${orgId} and o."broadcastId" is not null
    )
    select 'enviados' as metrica, to_char((("sentAt" at time zone 'UTC') at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD') as dia, count(*) as total
      from q where "sentAt" >= ${de} and "sentAt" < ${ate} group by 2
    union all
    select 'entregues', to_char((("deliveredAt" at time zone 'UTC') at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD'), count(*)
      from q where "deliveredAt" >= ${de} and "deliveredAt" < ${ate} group by 2
    union all
    select 'lidos', to_char((("readAt" at time zone 'UTC') at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD'), count(*)
      from q where "readAt" >= ${de} and "readAt" < ${ate} group by 2
    union all
    select 'respostas', to_char((("repliedAt" at time zone 'UTC') at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD'), count(*)
      from q where "repliedAt" >= ${de} and "repliedAt" < ${ate} group by 2
    union all
    select 'falhas', to_char((("createdAt" at time zone 'UTC') at time zone 'America/Sao_Paulo')::date, 'YYYY-MM-DD'), count(*)
      from q where status = 'failed' and "createdAt" >= ${de} and "createdAt" < ${ate} group by 2`;
}

export async function GET(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const url = new URL(request.url);
  const p = periodo(Number(url.searchParams.get("dias") ?? 7));
  const dias = diasDoPeriodo(p.de, p.dias);
  const doContrato = { broadcastId: { not: null }, agent: { orgId: ctx.orgId } };

  const [linhas, linhasAntes, motivos, porAgente, canais, disparos] = await Promise.all([
    porDia(ctx.orgId, p.de, p.ate),
    porDia(ctx.orgId, p.antesDe, p.antesAte),
    prisma.outboundQueueItem.groupBy({
      by: ["error"],
      where: { ...doContrato, status: "failed", createdAt: { gte: p.de, lt: p.ate } },
      _count: { _all: true },
      orderBy: { _count: { error: "desc" } },
      take: 8,
    }),
    // Por chip (agente): itens enviados no período, com o que aconteceu com eles.
    prisma.$queryRaw<{ agentId: string; enviados: bigint; entregues: bigint; lidos: bigint; respostas: bigint; falhas: bigint }[]>`
      select o."agentId",
        count(*) filter (where o."sentAt" is not null) as enviados,
        count(*) filter (where o."deliveredAt" is not null) as entregues,
        count(*) filter (where o."readAt" is not null) as lidos,
        count(*) filter (where o."repliedAt" is not null) as respostas,
        count(*) filter (where o.status = 'failed') as falhas
      from eva_studio_outbound_queue o
      join eva_studio_agents a on a.id = o."agentId"
      where a."orgId" = ${ctx.orgId} and o."broadcastId" is not null and o."createdAt" >= ${p.de} and o."createdAt" < ${p.ate}
      group by o."agentId"`,
    prisma.canal.findMany({ where: { orgId: ctx.orgId, tipo: "whatsapp_qr" }, select: { agentId: true, rotulo: true } }),
    prisma.broadcast.findMany({
      where: { kind: "campaign", agent: { orgId: ctx.orgId }, createdAt: { gte: p.de, lt: p.ate } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, name: true, agentId: true, text: true, status: true, createdAt: true, totalCount: true, sentCount: true, failedCount: true, deliveredCount: true, readCount: true, agent: { select: { name: true } } },
    }),
  ]);

  const respostasPorDisparo = disparos.length
    ? new Map(
        (
          await prisma.outboundQueueItem.groupBy({
            by: ["broadcastId"],
            where: { broadcastId: { in: disparos.map((d) => d.id) }, repliedAt: { not: null } },
            _count: { _all: true },
          })
        ).map((g) => [g.broadcastId, g._count._all])
      )
    : new Map<string | null, number>();

  const serie = seriePorDia(linhas, dias);
  const totais = somar(serie);
  const antes = somar(seriePorDia(linhasAntes, diasDoPeriodo(p.antesDe, p.dias)));
  const numeroDe = new Map(canais.filter((c) => c.agentId).map((c) => [c.agentId!, c.rotulo]));
  const nomes = new Map(
    (await prisma.agent.findMany({ where: { orgId: ctx.orgId, id: { in: porAgente.map((a) => a.agentId) } }, select: { id: true, name: true } })).map((a) => [a.id, a.name])
  );

  if (url.searchParams.get("format") === "csv") {
    const csv = paraCsv(["dia", ...METRICAS.map((m) => ROTULO_DA_METRICA[m].toLowerCase())], serie.map((d) => [d.dia, ...METRICAS.map((m) => d[m])]));
    return new Response(csv, {
      headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="relatorio-disparos-${dias[0]}-a-${dias[dias.length - 1]}.csv"` },
    });
  }

  return NextResponse.json({
    periodo: { dias: p.dias, de: dias[0], ate: dias[dias.length - 1] },
    totais,
    variacao: Object.fromEntries(METRICAS.map((m) => [m, variacao(totais[m], antes[m])])) as Record<keyof Totais, number | null>,
    taxas: {
      entrega: taxa(totais.entregues, totais.enviados),
      leitura: taxa(totais.lidos, totais.enviados),
      resposta: taxa(totais.respostas, totais.enviados),
      falha: taxa(totais.falhas, totais.enviados + totais.falhas),
    },
    serie,
    motivos: motivos.map((m) => ({ motivo: m.error || "Sem motivo registrado", total: m._count._all })),
    chips: porAgente
      .map((a) => {
        const envios = { enviados: Number(a.enviados), entregues: Number(a.entregues), falhas: Number(a.falhas) };
        return {
          agentId: a.agentId,
          agente: nomes.get(a.agentId) ?? "Agente removido",
          numero: numeroDe.get(a.agentId) ? numeroDoDestino(numeroDe.get(a.agentId)!) : null,
          ...envios,
          lidos: Number(a.lidos),
          respostas: Number(a.respostas),
          ...qualidadeDoChip(envios),
        };
      })
      .sort((x, y) => y.enviados - x.enviados),
    disparos: disparos.map((d) => ({
      id: d.id,
      agentId: d.agentId,
      agente: d.agent.name,
      texto: (d.name?.trim() || d.text).slice(0, 120),
      status: d.status,
      criadoEm: d.createdAt.toISOString(),
      total: d.totalCount,
      enviados: d.sentCount,
      falhas: d.failedCount,
      entregues: d.deliveredCount,
      lidos: d.readCount,
      respostas: respostasPorDisparo.get(d.id) ?? 0,
    })),
  });
}
