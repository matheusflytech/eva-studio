import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";
import { toAgentDTO } from "@/lib/server/agent-dto";

const include = { variables: true, knowledgeBase: true } as const;

export async function GET() {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const rows = await prisma.agent.findMany({ where: { orgId }, include, orderBy: { updatedAt: "desc" } });
  return NextResponse.json({ agents: rows.map(toAgentDTO) });
}

export async function POST(request: Request) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await request.json();
  const id = body.id as string;
  if (!id) return NextResponse.json({ error: "id é obrigatório." }, { status: 400 });

  const row = await prisma.agent.create({
    data: {
      id,
      orgId,
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
