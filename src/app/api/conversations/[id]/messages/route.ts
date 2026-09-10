import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;

  const conversation = await prisma.conversation.findFirst({ where: { id, agent: { orgId } } });
  if (!conversation) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });

  const messages = await prisma.message.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    messages: messages.map((m) => ({ id: m.id, role: m.role, text: m.text, createdAt: m.createdAt.toISOString() })),
  });
}
