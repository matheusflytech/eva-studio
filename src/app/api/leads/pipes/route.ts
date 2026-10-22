import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { erro } from "@/lib/server/api-validacao";
import { CANAL_DO_SITE } from "@/lib/server/conversa-externa";

// "Pipes" da tela de Leads: um por agente de site (o widget da Eva Holding,
// o chat do Drawing Club...). Entra todo agente com conversa no canal do site
// ou com o site como canal principal (aparece antes da primeira conversa).
export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return erro(ctx.error, ctx.status);
  const grupos = await prisma.conversation.groupBy({
    by: ["agentId"],
    where: { channel: CANAL_DO_SITE, agent: { orgId: ctx.orgId } },
    _count: { _all: true },
  });
  const agentes = await prisma.agent.findMany({
    where: { orgId: ctx.orgId, OR: [{ id: { in: grupos.map((g) => g.agentId) } }, { primaryChannel: CANAL_DO_SITE }] },
    select: { id: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  const porAgente = new Map(grupos.map((g) => [g.agentId, g._count._all]));
  return NextResponse.json({ pipes: agentes.map((a) => ({ agentId: a.id, nome: a.name, conversas: porAgente.get(a.id) ?? 0 })) });
}
