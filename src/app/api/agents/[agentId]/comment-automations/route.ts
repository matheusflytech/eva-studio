import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const automations = await prisma.commentAutomation.findMany({ where: { agentId }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ automations });
}

export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const { name, mediaId, keyword, publicReply, dmMessage, active } = await request.json();
  if (!name?.trim() || !dmMessage?.trim()) {
    return NextResponse.json({ error: "name e dmMessage são obrigatórios." }, { status: 400 });
  }

  const automation = await prisma.commentAutomation.create({
    data: {
      agentId,
      name: name.trim(),
      mediaId: mediaId?.trim() ?? "",
      keyword: keyword?.trim() ?? "",
      publicReply: publicReply?.trim() ?? "",
      dmMessage: dmMessage.trim(),
      active: active ?? true,
    },
  });

  return NextResponse.json({ automation });
}
