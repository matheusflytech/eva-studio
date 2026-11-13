import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { inicioDoDiaEmBrasilia } from "@/lib/disparos/situacao";

// Painel de disparos do contrato (tela inicial do app de disparos):
// o dia de hoje (Brasília), o uso de cada chip contra o limite diário do worker
// e os últimos disparos com o progresso.
// O limite é o mesmo número configurado no worker (DISPARO_LIMITE_DIA, padrão 200);
// aqui ele só serve para desenhar a barra.
export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const desde = inicioDoDiaEmBrasilia();
  const limiteDia = Number(process.env.DISPARO_LIMITE_DIA) > 0 ? Number(process.env.DISPARO_LIMITE_DIA) : 200;
  const doContrato = { broadcastId: { not: null }, agent: { orgId: ctx.orgId } };

  const [enviados, entregues, lidos, falhas, naFila, porAgente, canais, recentes] = await Promise.all([
    prisma.outboundQueueItem.count({ where: { ...doContrato, sentAt: { gte: desde } } }),
    prisma.outboundQueueItem.count({ where: { ...doContrato, deliveredAt: { gte: desde } } }),
    prisma.outboundQueueItem.count({ where: { ...doContrato, readAt: { gte: desde } } }),
    prisma.outboundQueueItem.count({ where: { ...doContrato, status: "failed", createdAt: { gte: desde } } }),
    prisma.outboundQueueItem.count({ where: { ...doContrato, status: "pending" } }),
    prisma.outboundQueueItem.groupBy({ by: ["agentId"], where: { ...doContrato, claimedAt: { gte: desde } }, _count: { _all: true } }),
    prisma.canal.findMany({
      where: { orgId: ctx.orgId, tipo: "whatsapp_qr" },
      select: { id: true, rotulo: true, status: true, agentId: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.broadcast.findMany({
      where: { kind: "campaign", agent: { orgId: ctx.orgId } },
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true, agentId: true, channel: true, text: true, status: true, createdAt: true, scheduledAt: true,
        totalCount: true, sentCount: true, failedCount: true, deliveredCount: true, readCount: true,
        agent: { select: { name: true } },
      },
    }),
  ]);

  const soltos = new Map(porAgente.map((g) => [g.agentId, g._count._all]));
  const agentIds = [...new Set(canais.map((c) => c.agentId).filter((id): id is string => !!id))];
  const nomes = new Map(
    (await prisma.agent.findMany({ where: { id: { in: agentIds }, orgId: ctx.orgId }, select: { id: true, name: true } })).map((a) => [a.id, a.name])
  );

  return NextResponse.json({
    hoje: { enviados, entregues, lidos, falhas, naFila },
    limiteDia,
    chips: canais.map((c) => ({
      canalId: c.id,
      numero: c.rotulo,
      status: c.status,
      agentId: c.agentId,
      agente: c.agentId ? nomes.get(c.agentId) ?? null : null,
      usadosHoje: c.agentId ? soltos.get(c.agentId) ?? 0 : 0,
    })),
    disparos: recentes.map((b) => ({
      id: b.id,
      agentId: b.agentId,
      agente: b.agent.name,
      channel: b.channel,
      texto: b.text.slice(0, 140),
      status: b.status,
      criadoEm: b.createdAt.toISOString(),
      agendadoPara: b.scheduledAt?.toISOString() ?? null,
      total: b.totalCount,
      enviados: b.sentCount,
      falhas: b.failedCount,
      entregues: b.deliveredCount,
      lidos: b.readCount,
    })),
  });
}
