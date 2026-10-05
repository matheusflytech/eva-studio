import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";

// "Assumir": o atendente pega a conversa. O agente fica mudo até alguém
// devolver. Funciona em qualquer conversa, não só nas que o agente passou:
// numa operação de verdade a pessoa entra quando quer.
//
// Se outra pessoa já está com ela, só assume quem pedir de forma explícita
// (`forcar: true`) — a tela mostra um aviso antes.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("conversations:reply");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const conversa = await prisma.conversation.findFirst({
    where: { id, agent: { orgId: ctx.orgId } },
    include: { assignedTo: { select: { id: true, name: true } } },
  });
  if (!conversa) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });

  const { forcar } = await request.json().catch(() => ({ forcar: false }));
  if (conversa.status === "human" && conversa.assignedToId && conversa.assignedToId !== ctx.userId && !forcar) {
    return NextResponse.json(
      {
        error: `${conversa.assignedTo?.name ?? "Outra pessoa"} está atendendo esta conversa.`,
        codigo: "de_outro",
        assignedTo: conversa.assignedTo,
      },
      { status: 409 }
    );
  }

  await prisma.conversation.update({
    where: { id },
    data: { status: "human", assignedToId: ctx.userId, readAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
