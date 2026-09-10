import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

export async function DELETE(_request: Request, { params }: { params: Promise<{ agentId: string; docId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId, docId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  await prisma.knowledgeDoc.deleteMany({ where: { id: docId, agentId } });
  return NextResponse.json({ ok: true });
}
