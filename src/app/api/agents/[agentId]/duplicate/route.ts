import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { duplicateAgent } from "@/lib/server/duplicate-agent";

export async function POST(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const novo = await duplicateAgent(ctx.orgId, agentId);
  if (!novo) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
  return NextResponse.json({ id: novo.id }, { status: 201 });
}
