import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { requirePermission } from "@/lib/server/permissions";
import { prisma } from "@/lib/db/prisma";
import { MAX_FLUXOS, sanearPalavras } from "@/lib/subfluxos";

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

/** Fluxo novo já nasce com o bloco Início, como o principal. */
export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;
  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId: ctx.orgId }, select: { id: true } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const corpo = (await request.json().catch(() => ({}))) as { name?: unknown; keywords?: unknown };
  const name = typeof corpo.name === "string" ? corpo.name.trim().slice(0, 60) : "";
  if (!name) return NextResponse.json({ error: "Dê um nome ao fluxo." }, { status: 400 });

  const total = await prisma.agentSubflow.count({ where: { agentId } });
  if (total >= MAX_FLUXOS) return NextResponse.json({ error: `Máximo de ${MAX_FLUXOS} fluxos por agente.` }, { status: 422 });
  if (await prisma.agentSubflow.findFirst({ where: { agentId, name: { equals: name, mode: "insensitive" } }, select: { id: true } })) {
    return NextResponse.json({ error: "Já existe um fluxo com esse nome." }, { status: 409 });
  }

  const flow = await prisma.agentSubflow.create({
    data: {
      agentId,
      name,
      keywords: sanearPalavras(corpo.keywords),
      position: total,
      nodes: [{ id: "inicio", type: "flowNode", position: { x: 0, y: 0 }, data: { iconKey: "start", label: "Início", kind: "Ponto de entrada", hasTarget: false } }],
      edges: [],
    },
    select: LISTA,
  });
  return NextResponse.json({ flow }, { status: 201 });
}
