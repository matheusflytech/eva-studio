import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { requirePermission } from "@/lib/server/permissions";
import { prisma } from "@/lib/db/prisma";
import { validarFluxo } from "@/lib/server/api-v1/fluxos";
import { ErroApi } from "@/lib/server/api-v1/http";
import { sanearPalavras } from "@/lib/subfluxos";

// Um fluxo extra do bot: abre, salva (blocos e ligações pela mesma validação
// do principal, ou nome e palavras-chave) e apaga.

type Params = { params: Promise<{ agentId: string; flowId: string }> };

async function acharFluxo(orgId: string, agentId: string, flowId: string) {
  return prisma.agentSubflow.findFirst({ where: { id: flowId, agentId, agent: { orgId } } });
}

export async function GET(_request: Request, { params }: Params) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId, flowId } = await params;
  const flow = await acharFluxo(orgId, agentId, flowId);
  if (!flow) return NextResponse.json({ error: "Fluxo não encontrado." }, { status: 404 });
  return NextResponse.json({ flow: { id: flow.id, name: flow.name, keywords: flow.keywords, nodes: flow.nodes, edges: flow.edges } });
}

export async function PUT(request: Request, { params }: Params) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId, flowId } = await params;
  const flow = await acharFluxo(ctx.orgId, agentId, flowId);
  if (!flow) return NextResponse.json({ error: "Fluxo não encontrado." }, { status: 404 });

  let corpo: { nodes?: unknown; edges?: unknown; name?: unknown; keywords?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const data: { name?: string; keywords?: string[]; nodes?: object; edges?: object } = {};
  if (corpo.name !== undefined) {
    const name = typeof corpo.name === "string" ? corpo.name.trim().slice(0, 60) : "";
    if (!name) return NextResponse.json({ error: "Dê um nome ao fluxo." }, { status: 400 });
    const repetido = await prisma.agentSubflow.findFirst({
      where: { agentId, id: { not: flowId }, name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    if (repetido) return NextResponse.json({ error: "Já existe um fluxo com esse nome." }, { status: 409 });
    data.name = name;
  }
  if (corpo.keywords !== undefined) data.keywords = sanearPalavras(corpo.keywords);

  let avisos: unknown[] = [];
  if (corpo.nodes !== undefined || corpo.edges !== undefined) {
    const agent = await prisma.agent.findFirst({ where: { id: agentId }, select: { outboundUrl: true } });
    try {
      const r = await validarFluxo(ctx.orgId, { nodes: corpo.nodes, edges: corpo.edges }, { modo: "builder", temUrlDoFluxo: !!agent?.outboundUrl?.trim() });
      data.nodes = r.nodes as unknown as object;
      data.edges = r.edges as unknown as object;
      avisos = r.avisos;
    } catch (err) {
      if (err instanceof ErroApi) {
        const issues = (err.extra.details as { issues?: unknown[] } | undefined)?.issues ?? [];
        return NextResponse.json({ error: err.message, issues }, { status: err.status });
      }
      throw err;
    }
  }

  await prisma.agentSubflow.update({ where: { id: flowId }, data });
  return NextResponse.json({ ok: true, avisos });
}

/** Conversa que estava neste fluxo volta para o principal na próxima mensagem. */
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId, flowId } = await params;
  const flow = await acharFluxo(ctx.orgId, agentId, flowId);
  if (!flow) return NextResponse.json({ error: "Fluxo não encontrado." }, { status: 404 });
  await prisma.$transaction([
    prisma.conversation.updateMany({ where: { agentId, currentFlowId: flowId }, data: { currentFlowId: null, currentNodeId: null } }),
    prisma.agentSubflow.delete({ where: { id: flowId } }),
  ]);
  return NextResponse.json({ ok: true });
}
