import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";
import { toAgentDTO } from "@/lib/server/agent-dto";

const include = { variables: true, knowledgeBase: true } as const;

export async function POST(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const existing = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!existing) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const row = await prisma.agent.update({
    where: { id: agentId },
    data: { status: existing.status === "active" ? "paused" : "active" },
    include,
  });

  return NextResponse.json({ agent: toAgentDTO(row) });
}
