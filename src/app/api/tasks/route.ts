import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { createTask, parseRelativeDue } from "@/lib/server/crm";
import type { Prisma } from "@/generated/prisma/client";

// Tarefas da organização.
//   ?scope=minhas|todas   (padrão: minhas)
//   ?status=abertas|feitas|todas  (padrão: abertas)
export async function GET(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const params = new URL(request.url).searchParams;
  const scope = params.get("scope") ?? "minhas";
  const status = params.get("status") ?? "abertas";

  const where: Prisma.TaskWhereInput = { orgId: ctx.orgId };
  if (scope === "minhas") where.assignedToId = ctx.userId;
  if (status === "abertas") where.doneAt = null;
  if (status === "feitas") where.doneAt = { not: null };

  const tasks = await prisma.task.findMany({
    where,
    include: {
      contact: { select: { id: true, name: true, phone: true } },
      deal: { select: { id: true, name: true } },
      assignedTo: { select: { id: true, name: true } },
    },
    // Sem prazo vai pro fim: tarefa sem data não é urgente por definição.
    orderBy: [{ doneAt: "asc" }, { dueAt: { sort: "asc", nulls: "last" } }],
    take: 200,
  });

  return NextResponse.json({
    tasks: tasks.map((t) => ({
      id: t.id,
      type: t.type,
      text: t.text,
      dueAt: t.dueAt?.toISOString() ?? null,
      doneAt: t.doneAt?.toISOString() ?? null,
      contact: t.contact,
      deal: t.deal,
      assignedTo: t.assignedTo,
      // Atrasada é o único estado que precisa saltar aos olhos numa lista.
      overdue: !t.doneAt && !!t.dueAt && t.dueAt.getTime() < Date.now(),
    })),
  });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json();
  const text = String(body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "Descreva a tarefa." }, { status: 400 });

  // Aceita data absoluta (da tela) ou prazo relativo (de automação).
  const dueAt = body.dueAt
    ? new Date(body.dueAt)
    : body.due
      ? parseRelativeDue(String(body.due))
      : null;

  const task = await createTask({
    orgId: ctx.orgId,
    text,
    type: String(body.type ?? "ligar"),
    contactId: body.contactId || null,
    dealId: body.dealId || null,
    assignedToId: body.assignedToId || ctx.userId,
    dueAt: dueAt && !Number.isNaN(dueAt.getTime()) ? dueAt : null,
  });

  return NextResponse.json({ task: { id: task.id } });
}
