import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";

// PATCH { done: true|false, text?, dueAt?, assignedToId? }
export async function PATCH(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { taskId } = await params;

  const task = await prisma.task.findFirst({ where: { id: taskId, orgId: ctx.orgId } });
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });

  const body = await request.json();

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      // Desmarcar zera a data em vez de guardar histórico: a informação que
      // importa é "está feita ou não", e guardar meia-verdade confunde.
      doneAt: body.done === true ? new Date() : body.done === false ? null : undefined,
      text: typeof body.text === "string" && body.text.trim() ? body.text.trim() : undefined,
      type: typeof body.type === "string" ? body.type : undefined,
      dueAt: body.dueAt !== undefined ? (body.dueAt ? new Date(body.dueAt) : null) : undefined,
      assignedToId: body.assignedToId !== undefined ? body.assignedToId || null : undefined,
    },
  });

  return NextResponse.json({ task: { id: updated.id, doneAt: updated.doneAt?.toISOString() ?? null } });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { taskId } = await params;

  const task = await prisma.task.findFirst({ where: { id: taskId, orgId: ctx.orgId } });
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });

  await prisma.task.delete({ where: { id: task.id } });
  return NextResponse.json({ ok: true });
}
