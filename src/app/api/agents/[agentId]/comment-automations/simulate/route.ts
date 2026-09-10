import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";
import { matchCommentAutomation } from "@/lib/server/comment-automation";

// Simula "alguém comentou X" sem precisar de uma conta Instagram conectada
// de verdade — só calcula qual automação bateria e o que ela mandaria, sem
// nenhum efeito colateral (não manda nada, não grava conversa).
export async function POST(request: Request, { params }: { params: Promise<{ agentId: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { agentId } = await params;

  const agent = await prisma.agent.findFirst({ where: { id: agentId, orgId } });
  if (!agent) return NextResponse.json({ error: "Agente não encontrado." }, { status: 404 });

  const { text, mediaId } = await request.json();
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "text é obrigatório." }, { status: 400 });
  }

  const automations = await prisma.commentAutomation.findMany({ where: { agentId } });
  const match = matchCommentAutomation(automations, { mediaId: mediaId?.trim() ?? "", text });

  return NextResponse.json({
    matched: match
      ? { id: match.id, publicReply: match.publicReply || null, dmMessage: match.dmMessage }
      : null,
  });
}
