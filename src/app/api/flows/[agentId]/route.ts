import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";
import { validarFluxo } from "@/lib/server/api-v1/fluxos";
import { ErroApi } from "@/lib/server/api-v1/http";

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

// Salvamento automático do Builder. Passa pela mesma validação da API v1
// (validarFluxo), no modo "builder": o que corrompe o fluxo (ligação para
// bloco que não existe, id repetido, sem Início, id de outra organização)
// não entra; bloco pela metade entra e volta como aviso, porque o canvas
// salva enquanto a pessoa ainda está montando.
export async function PUT(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId }, select: { id: true, outboundUrl: true } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  let corpo: { nodes?: unknown; edges?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  try {
    const { nodes, edges, avisos } = await validarFluxo(orgId, corpo ?? {}, {
      modo: "builder",
      temUrlDoFluxo: !!agent.outboundUrl?.trim(),
    });
    const n = nodes as unknown as object;
    const e = edges as unknown as object;
    await prisma.agentFlow.upsert({ where: { agentId }, create: { agentId, nodes: n, edges: e }, update: { nodes: n, edges: e } });
    return NextResponse.json({ ok: true, avisos });
  } catch (err) {
    if (err instanceof ErroApi) {
      const issues = (err.extra.details as { issues?: unknown[] } | undefined)?.issues ?? [];
      return NextResponse.json({ error: err.message, issues }, { status: err.status });
    }
    throw err;
  }
}
