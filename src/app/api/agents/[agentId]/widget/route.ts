import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  return NextResponse.json({ enabled: agent.widgetEnabled });
}

// Liga/desliga o widget — mesmo padrão do toggle de status do agente.
export async function POST(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const existing = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!existing) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const agent = await prisma.agent.update({ where: { id: agentId }, data: { widgetEnabled: !existing.widgetEnabled } });
  return NextResponse.json({ enabled: agent.widgetEnabled });
}
