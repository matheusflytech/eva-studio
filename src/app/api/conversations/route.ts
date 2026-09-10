import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const rows = await prisma.conversation.findMany({
    where: { agent: { orgId } },
    include: {
      agent: { select: { name: true } },
      messages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    conversations: rows.map((c) => ({
      id: c.id,
      agentId: c.agentId,
      agentName: c.agent.name,
      channel: c.channel,
      contactId: c.contactId,
      status: c.status,
      updatedAt: c.updatedAt.toISOString(),
      lastContactMessageAt: c.lastContactMessageAt ? c.lastContactMessageAt.toISOString() : null,
      lastMessage: c.messages[0]
        ? { text: c.messages[0].text, role: c.messages[0].role, createdAt: c.messages[0].createdAt.toISOString() }
        : null,
    })),
  });
}
