import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";

// Atribuição de conversa no inbox humano. Sem isso, um time de dois
// atendentes responde a mesma pessoa duas vezes — é o problema que qualquer
// caixa de entrada compartilhada tem no primeiro dia de uso.
//
// PATCH { assignedToId: "<id do perfil>" | null }  (null = devolver pra fila)
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("conversations:reply");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const conversation = await prisma.conversation.findFirst({
    where: { id, agent: { orgId: ctx.orgId } },
  });
  if (!conversation) return NextResponse.json({ error: "Conversa não encontrada." }, { status: 404 });

  const body = await request.json();
  const assignedToId = body.assignedToId === null ? null : String(body.assignedToId ?? "").trim();

  if (assignedToId) {
    const member = await prisma.profile.findFirst({ where: { id: assignedToId, orgId: ctx.orgId } });
    if (!member) return NextResponse.json({ error: "Atendente não encontrado nessa organização." }, { status: 404 });
  }

  const updated = await prisma.conversation.update({
    where: { id },
    data: { assignedToId: assignedToId || null },
    include: { assignedTo: { select: { id: true, name: true } } },
  });

  return NextResponse.json({
    ok: true,
    assignedTo: updated.assignedTo ? { id: updated.assignedTo.id, name: updated.assignedTo.name } : null,
  });
}
