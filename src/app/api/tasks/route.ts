import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { TIPOS_DE_TAREFA, createTask, parseRelativeDue, statusDaReferencia } from "@/lib/server/crm";
import { JSON_INVALIDO, conferirReferencias, dataOpcional, erro, lerCorpo, texto } from "@/lib/server/api-validacao";
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
    // Em aberto primeiro (doneAt nulo; no Postgres NULL vem por último no
    // "asc"). Sem prazo vai pro fim: tarefa sem data não é urgente por definição.
    orderBy: [{ doneAt: { sort: "asc", nulls: "first" } }, { dueAt: { sort: "asc", nulls: "last" } }],
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

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const text = texto(body.text, 5000) ?? "";
  if (!text) return erro("Descreva a tarefa.");

  const type = body.type === undefined || body.type === null || body.type === "" ? "ligar" : body.type;
  if (!(TIPOS_DE_TAREFA as readonly unknown[]).includes(type)) return erro("Tipo de tarefa inválido.");

  // Aceita data absoluta (da tela) ou prazo relativo (de automação).
  let dueAt: Date | null = null;
  if (body.dueAt !== undefined && body.dueAt !== null && body.dueAt !== "") {
    const d = dataOpcional(body.dueAt);
    if (d === "invalida") return erro("Prazo inválido.");
    dueAt = d ?? null;
  } else if (body.due) {
    dueAt = parseRelativeDue(String(body.due));
  }

  const erroRef = await conferirReferencias(ctx.orgId, {
    contactId: body.contactId,
    dealId: body.dealId,
    assignedToId: body.assignedToId,
  });
  if (erroRef) return erro(erroRef, statusDaReferencia(erroRef));

  const task = await createTask({
    orgId: ctx.orgId,
    text,
    type: type as string,
    contactId: (body.contactId as string) || null,
    dealId: (body.dealId as string) || null,
    assignedToId: (body.assignedToId as string) || ctx.userId,
    dueAt,
  });

  return NextResponse.json({ task: { id: task.id } });
}
