import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

async function assertOwnership(agentId: string, id: string, orgId: string) {
  return prisma.commentAutomation.findFirst({ where: { id, agentId, agent: { orgId } } });
}

export async function PUT(request: Request, { params }: { params: Promise<{ agentId: string; id: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId, id } = await params;

  const existing = await assertOwnership(agentId, id, orgId);
  if (!existing) return NextResponse.json({ error: "Automação não encontrada." }, { status: 404 });

  const { name, mediaId, keyword, publicReply, dmMessage, active } = await request.json();
  if (!name?.trim() || !dmMessage?.trim()) {
    return NextResponse.json({ error: "name e dmMessage são obrigatórios." }, { status: 400 });
  }

  const automation = await prisma.commentAutomation.update({
    where: { id },
    data: {
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

export async function DELETE(_request: Request, { params }: { params: Promise<{ agentId: string; id: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId, id } = await params;

  const existing = await assertOwnership(agentId, id, orgId);
  if (!existing) return NextResponse.json({ error: "Automação não encontrada." }, { status: 404 });

  await prisma.commentAutomation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
