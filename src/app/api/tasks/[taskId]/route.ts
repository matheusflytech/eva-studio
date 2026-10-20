import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { TIPOS_DE_TAREFA, statusDaReferencia } from "@/lib/server/crm";
import { JSON_INVALIDO, conferirReferencias, dataOpcional, erro, lerCorpo, texto } from "@/lib/server/api-validacao";
import { tocarAtividadeDaTarefa } from "@/lib/server/atividade-do-negocio";

// PATCH { done: true|false, text?, dueAt?, assignedToId? }
export async function PATCH(request: Request, { params }: { params: Promise<{ taskId: string }> }) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { taskId } = await params;

  const task = await prisma.task.findFirst({ where: { id: taskId, orgId: ctx.orgId } });
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);

  if (body.type !== undefined && !(TIPOS_DE_TAREFA as readonly unknown[]).includes(body.type)) {
    return erro("Tipo de tarefa inválido.");
  }
  const dueAt = dataOpcional(body.dueAt);
  if (dueAt === "invalida") return erro("Prazo inválido.");
  const erroRef = await conferirReferencias(ctx.orgId, { assignedToId: body.assignedToId });
  if (erroRef) return erro(erroRef, statusDaReferencia(erroRef));
  const text = typeof body.text === "string" ? texto(body.text, 5000) : undefined;

  const updated = await prisma.task.update({
    where: { id: task.id },
    data: {
      // Desmarcar zera a data em vez de guardar histórico: a informação que
      // importa é "está feita ou não", e guardar meia-verdade confunde.
      doneAt: body.done === true ? new Date() : body.done === false ? null : undefined,
      text: text || undefined,
      type: body.type !== undefined ? (body.type as string) : undefined,
      dueAt,
      assignedToId: body.assignedToId !== undefined ? (body.assignedToId as string) || null : undefined,
    },
  });
  // Tarefa concluída zera o relógio do "parado" do negócio.
  if (body.done === true && !task.doneAt) await tocarAtividadeDaTarefa(updated);

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
