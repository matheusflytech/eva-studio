import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

// Lista as últimas execuções do fluxo desse agente (aba "Execuções" do
// Builder) — cada linha já vem com os "steps" (nó a nó) gravados por
// advanceConversation() em flow-engine.ts.
export async function GET(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const { searchParams } = new URL(request.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 50, 200);

  const executions = await prisma.flowExecution.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return NextResponse.json({ executions });
}
