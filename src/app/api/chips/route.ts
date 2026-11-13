import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { ehTabelaAusente } from "@/lib/server/contratos";
import { inicioDoDiaEmBrasilia } from "@/lib/disparos/situacao";
import { qualidadeDoChip } from "@/lib/disparos/qualidade";

// Chips (números do WhatsApp via QR) do contrato, para a tela Chips do app de
// disparos: situação da sessão, uso de hoje contra o limite, último disparo e a
// qualidade dos envios dos últimos 7 dias.
const DIAS = 7;

async function sessoes(canalIds: string[]) {
  if (canalIds.length === 0) return new Map<string, { status: string; lastError: string | null; lastConnectedAt: Date | null; lastDisconnectedAt: Date | null; reconnectAttempts: number }>();
  try {
    const rows = await prisma.canalWhatsAppQr.findMany({
      where: { canalId: { in: canalIds } },
      select: { canalId: true, status: true, lastError: true, lastConnectedAt: true, lastDisconnectedAt: true, reconnectAttempts: true },
    });
    return new Map(rows.map((r) => [r.canalId, r]));
  } catch (e) {
    // Sem a SQL 2026-11-07 (histórico de quedas): só a situação.
    if (!ehTabelaAusente(e)) throw e;
    const rows = await prisma.canalWhatsAppQr.findMany({ where: { canalId: { in: canalIds } }, select: { canalId: true, status: true, lastError: true } });
    return new Map(rows.map((r) => [r.canalId, { ...r, lastConnectedAt: null, lastDisconnectedAt: null, reconnectAttempts: 0 }]));
  }
}

export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const canais = await prisma.canal.findMany({
    where: { orgId: ctx.orgId, tipo: "whatsapp_qr" },
    select: { id: true, rotulo: true, status: true, agentId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const agentIds = [...new Set(canais.map((c) => c.agentId).filter((id): id is string => !!id))];
  const hoje = inicioDoDiaEmBrasilia();
  const semana = new Date(Date.now() - DIAS * 86400_000);
  const doDisparo = { broadcastId: { not: null }, agentId: { in: agentIds } };

  const [agentes, sessao, usoHoje, enviados, entregues, falhas, ultimos] = await Promise.all([
    prisma.agent.findMany({ where: { id: { in: agentIds }, orgId: ctx.orgId }, select: { id: true, name: true } }),
    sessoes(canais.map((c) => c.id)),
    prisma.outboundQueueItem.groupBy({ by: ["agentId"], where: { ...doDisparo, claimedAt: { gte: hoje } }, _count: { _all: true } }),
    prisma.outboundQueueItem.groupBy({ by: ["agentId"], where: { ...doDisparo, sentAt: { gte: semana } }, _count: { _all: true } }),
    prisma.outboundQueueItem.groupBy({ by: ["agentId"], where: { ...doDisparo, sentAt: { gte: semana }, deliveredAt: { not: null } }, _count: { _all: true } }),
    prisma.outboundQueueItem.groupBy({ by: ["agentId"], where: { ...doDisparo, status: "failed", createdAt: { gte: semana } }, _count: { _all: true } }),
    prisma.outboundQueueItem.groupBy({ by: ["agentId"], where: { ...doDisparo, sentAt: { not: null } }, _max: { sentAt: true } }),
  ]);

  const conta = (g: { agentId: string; _count: { _all: number } }[]) => new Map(g.map((x) => [x.agentId, x._count._all]));
  const [mUso, mEnv, mEnt, mFal] = [conta(usoHoje), conta(enviados), conta(entregues), conta(falhas)];
  const mUltimo = new Map(ultimos.map((x) => [x.agentId, x._max.sentAt]));
  const nomes = new Map(agentes.map((a) => [a.id, a.name]));
  const limiteDia = Number(process.env.DISPARO_LIMITE_DIA) > 0 ? Number(process.env.DISPARO_LIMITE_DIA) : 200;

  return NextResponse.json({
    limiteDia,
    dias: DIAS,
    chips: canais.map((c) => {
      const a = c.agentId;
      const envios = { enviados: a ? mEnv.get(a) ?? 0 : 0, entregues: a ? mEnt.get(a) ?? 0 : 0, falhas: a ? mFal.get(a) ?? 0 : 0 };
      const s = sessao.get(c.id);
      return {
        canalId: c.id,
        numero: c.rotulo,
        status: c.status,
        sessao: s?.status ?? "disconnected",
        erro: s?.lastError ?? null,
        conectadoDesde: s?.lastConnectedAt?.toISOString() ?? null,
        caiuEm: s?.lastDisconnectedAt?.toISOString() ?? null,
        quedasSeguidas: s?.reconnectAttempts ?? 0,
        agentId: a,
        agente: a ? nomes.get(a) ?? null : null,
        usadosHoje: a ? mUso.get(a) ?? 0 : 0,
        ultimoDisparo: a ? mUltimo.get(a)?.toISOString() ?? null : null,
        ...envios,
        ...qualidadeDoChip(envios),
      };
    }),
  });
}
