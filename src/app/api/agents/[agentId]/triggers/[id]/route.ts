import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { parseTriggerInput } from "@/lib/server/triggers";
import { erroDoBlocoDeDestino } from "@/lib/server/trigger-guards";

type Params = { params: Promise<{ agentId: string; id: string }> };

async function acharDaOrg(agentId: string, id: string, orgId: string) {
  return prisma.agentTrigger.findFirst({ where: { id, agentId, agent: { orgId } }, select: { id: true } });
}

export async function PUT(request: Request, { params }: Params) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId, id } = await params;

  if (!(await acharDaOrg(agentId, id, ctx.orgId))) {
    return NextResponse.json({ error: "Gatilho não encontrado." }, { status: 404 });
  }
  const parsed = parseTriggerInput(await request.json().catch(() => null));
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const erro = await erroDoBlocoDeDestino(agentId, parsed.data.targetNodeId);
  if (erro) return NextResponse.json({ error: erro }, { status: 400 });

  const trigger = await prisma.agentTrigger.update({ where: { id }, data: parsed.data });
  return NextResponse.json({ trigger });
}

export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId, id } = await params;

  if (!(await acharDaOrg(agentId, id, ctx.orgId))) {
    return NextResponse.json({ error: "Gatilho não encontrado." }, { status: 404 });
  }
  await prisma.agentTrigger.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
