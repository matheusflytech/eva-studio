import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";
import { toAgentDTO } from "@/lib/server/agent-dto";

const include = { variables: true, knowledgeBase: true } as const;

export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const row = await prisma.agent.findFirst({ where: { id: agentId, orgId }, include });
  if (!row) return NextResponse.json({ agent: null });
  return NextResponse.json({ agent: toAgentDTO(row) });
}

export async function PUT(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const existing = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!existing) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const body = await request.json();

  await prisma.agentVariable.deleteMany({ where: { agentId } });
  await prisma.knowledgeDoc.deleteMany({ where: { agentId } });

  const row = await prisma.agent.update({
    where: { id: agentId },
    data: {
      name: body.name,
      description: body.description ?? "",
      tone: body.tone ?? "",
      language: body.language,
      primaryChannel: body.primaryChannel ?? "",
      instructions: body.instructions ?? "",
      guidelines: body.guidelines ?? "",
      skills: body.skills ?? [],
      tools: body.tools ?? [],
      outboundUrl: body.outboundUrl ?? "",
      variables: { create: (body.variables ?? []).map((v: { name: string; unit: string }) => ({ name: v.name, unit: v.unit })) },
      knowledgeBase: {
        create: (body.knowledgeBase ?? []).map((d: { fileName: string; sizeBytes: number; mimeType: string }) => ({
          fileName: d.fileName,
          sizeBytes: d.sizeBytes,
          mimeType: d.mimeType,
        })),
      },
    },
    include,
  });

  return NextResponse.json({ agent: toAgentDTO(row) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const existing = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!existing) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  await prisma.agent.delete({ where: { id: agentId } });
  return NextResponse.json({ ok: true });
}
