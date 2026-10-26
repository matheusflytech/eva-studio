import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { requirePermission } from "@/lib/server/permissions";
import { prisma } from "@/lib/db/prisma";
import { apagarSubfluxo, atualizarSubfluxo, respostaDoBuilder } from "@/lib/server/subfluxos";

// Um fluxo extra do bot: abre, salva (blocos e ligações pela mesma validação
// do principal, ou nome e palavras-chave) e apaga.

type Params = { params: Promise<{ agentId: string; flowId: string }> };

export async function GET(_request: Request, { params }: Params) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId, flowId } = await params;
  const flow = await prisma.agentSubflow.findFirst({ where: { id: flowId, agentId, agent: { orgId } } });
  if (!flow) return NextResponse.json({ error: "Fluxo não encontrado." }, { status: 404 });
  return NextResponse.json({ flow: { id: flow.id, name: flow.name, keywords: flow.keywords, nodes: flow.nodes, edges: flow.edges } });
}

export async function PUT(request: Request, { params }: Params) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId, flowId } = await params;
  let corpo: { nodes?: unknown; edges?: unknown; name?: unknown; keywords?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId }, select: { outboundUrl: true } });
  try {
    const { avisos } = await atualizarSubfluxo(ctx.orgId, agentId, flowId, corpo, { modo: "builder", temUrlDoFluxo: !!agent?.outboundUrl?.trim() });
    return NextResponse.json({ ok: true, avisos });
  } catch (err) {
    return respostaDoBuilder(err);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId, flowId } = await params;
  try {
    await apagarSubfluxo(ctx.orgId, agentId, flowId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return respostaDoBuilder(err);
  }
}
