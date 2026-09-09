import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const flow = await prisma.agentFlow.findUnique({ where: { agentId } });
  if (!flow) return NextResponse.json({ flow: null });
  return NextResponse.json({ flow: { nodes: flow.nodes, edges: flow.edges } });
}

export async function PUT(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const { nodes, edges } = await request.json();

  await prisma.agentFlow.upsert({
    where: { agentId },
    create: { agentId, nodes, edges },
    update: { nodes, edges },
  });

  return NextResponse.json({ ok: true });
}
