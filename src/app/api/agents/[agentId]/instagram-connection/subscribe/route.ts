import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { decryptSecret } from "@/lib/server/crypto";
import { assinarEventosInstagram } from "@/lib/server/instagram-subscribe";

export async function POST(_request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({
    where: { id: agentId, orgId: ctx.orgId },
    include: { instagramConnection: true },
  });
  if (!agent?.instagramConnection) return NextResponse.json({ error: "Instagram não conectado." }, { status: 404 });

  const result = await assinarEventosInstagram(decryptSecret(agent.instagramConnection.pageAccessToken));
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
