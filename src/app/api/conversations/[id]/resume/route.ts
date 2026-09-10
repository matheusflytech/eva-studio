import { NextResponse } from "next/server";
import type { Edge } from "@xyflow/react";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";
import { nextNodeId } from "@/lib/server/flow-engine";

// "Retomar bot" — sai do waiting_human e continua o fluxo a partir do bloco
// seguinte ao "Transferir p/ humano" onde a conversa estava parada. Sem
// saída conectada dali, a próxima mensagem do contato recomeça o fluxo do
// zero (mesmo comportamento de "conversa nova" que o motor já tem).
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;

  const conversation = await prisma.conversation.findFirst({ where: { id, agent: { orgId } } });
  if (!conversation) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });

  const flow = await prisma.agentFlow.findUnique({ where: { agentId: conversation.agentId } });
  const edges = (flow?.edges as unknown as Edge[]) ?? [];
  const next = conversation.currentNodeId ? nextNodeId(edges, conversation.currentNodeId) : null;

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { status: "active", currentNodeId: next },
  });

  return NextResponse.json({ ok: true });
}
