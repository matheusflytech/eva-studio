import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { requirePermission } from "@/lib/server/permissions";
import { prisma } from "@/lib/db/prisma";
import { criarSubfluxo, respostaDoBuilder } from "@/lib/server/subfluxos";

// Fluxos extras do bot (S4): lista e cria. O conteúdo de cada um (blocos e
// ligações) é salvo em ./[flowId], com a mesma validação do fluxo principal.

const LISTA = { id: true, name: true, keywords: true, position: true } as const;

export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId }, select: { id: true } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
  const flows = await prisma.agentSubflow.findMany({ where: { agentId }, select: LISTA, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json({ flows });
}

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId }, select: { outboundUrl: true } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });
  const corpo = (await request.json().catch(() => ({}))) as { name?: unknown; keywords?: unknown };
  try {
    const { flow } = await criarSubfluxo(ctx.orgId, agentId, { name: corpo.name, keywords: corpo.keywords }, { modo: "builder", temUrlDoFluxo: !!agent.outboundUrl?.trim() });
    return NextResponse.json({ flow: { id: flow.id, name: flow.name, keywords: flow.keywords, position: flow.position } }, { status: 201 });
  } catch (err) {
    return respostaDoBuilder(err);
  }
}
