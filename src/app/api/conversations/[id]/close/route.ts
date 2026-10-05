import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";

// "Resolver": encerra a conversa e solta a responsabilidade. Se o cliente
// escrever de novo, o fluxo recomeça do zero, que é o que se espera de um
// atendimento novo.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("conversations:reply");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const conversa = await prisma.conversation.findFirst({ where: { id, agent: { orgId: ctx.orgId } } });
  if (!conversa) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });

  await prisma.conversation.update({
    where: { id },
    // currentNodeId volta a null: sem isso a conversa "encerrada" ainda
    // lembraria da pergunta que estava no ar.
    data: { status: "ended", assignedToId: null, currentNodeId: null, readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
