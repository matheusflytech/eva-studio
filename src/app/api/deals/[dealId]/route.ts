import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { moveDealStage } from "@/lib/server/crm";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(_request: Request, { params }: { params: Promise<{ dealId: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { dealId } = await params;

  const deal = await prisma.deal.findFirst({
    where: { id: dealId, orgId: ctx.orgId },
    include: {
      stage: true,
      pipeline: { include: { stages: { orderBy: { position: "asc" } } } },
      company: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      contacts: { include: { contact: { select: { id: true, name: true, email: true, phone: true } } } },
      tasks: { orderBy: [{ doneAt: "asc" }, { dueAt: "asc" }] },
      notes: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!deal) return NextResponse.json({ error: "Negócio não encontrado." }, { status: 404 });

  return NextResponse.json({ deal });
}

// PATCH cobre três coisas: mover de etapa (passa por moveDealStage, que
// atualiza probabilidade e carimba fechamento), reordenar o card dentro da
// coluna, e editar os campos.
export async function PATCH(request: Request, { params }: { params: Promise<{ dealId: string }> }) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { dealId } = await params;

  const deal = await prisma.deal.findFirst({ where: { id: dealId, orgId: ctx.orgId } });
  if (!deal) return NextResponse.json({ error: "Negócio não encontrado." }, { status: 404 });

  const body = await request.json();

  if (body.stageId && body.stageId !== deal.stageId) {
    const stage = await prisma.pipelineStage.findFirst({
      where: { id: String(body.stageId), pipeline: { orgId: ctx.orgId } },
    });
    if (!stage) return NextResponse.json({ error: "Etapa não encontrada." }, { status: 404 });
    await moveDealStage(deal.id, stage.id, String(body.lostReason ?? ""));
  }

  const data: Prisma.DealUpdateInput = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.description === "string") data.description = body.description;
  if (body.amount !== undefined) data.amountCents = Math.max(0, Math.round(Number(body.amount) * 100) || 0);
  if (body.probability !== undefined) {
    data.probability = Math.min(100, Math.max(0, Number(body.probability) || 0));
  }
  if (body.position !== undefined) data.position = Number(body.position) || 0;
  // Sem trocar de etapa: é o caso de quem perdeu o negócio agora e só volta
  // depois para registrar por quê.
  if (typeof body.lostReason === "string" && !body.stageId) data.lostReason = body.lostReason;
  if (body.expectedClosingAt !== undefined) {
    data.expectedClosingAt = body.expectedClosingAt ? new Date(body.expectedClosingAt) : null;
  }
  if (body.archived === true) data.archivedAt = new Date();
  if (body.archived === false) data.archivedAt = null;
  if (body.companyId !== undefined) {
    data.company = body.companyId ? { connect: { id: String(body.companyId) } } : { disconnect: true };
  }
  if (body.ownerId !== undefined) {
    data.owner = body.ownerId ? { connect: { id: String(body.ownerId) } } : { disconnect: true };
  }

  if (Object.keys(data).length > 0) {
    await prisma.deal.update({ where: { id: deal.id }, data });
  }

  if (typeof body.addContactId === "string" && body.addContactId) {
    await prisma.dealContact.upsert({
      where: { dealId_contactId: { dealId: deal.id, contactId: body.addContactId } },
      create: { dealId: deal.id, contactId: body.addContactId },
      update: {},
    });
  }
  if (typeof body.removeContactId === "string" && body.removeContactId) {
    await prisma.dealContact.deleteMany({ where: { dealId: deal.id, contactId: body.removeContactId } });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ dealId: string }> }) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { dealId } = await params;

  const deal = await prisma.deal.findFirst({ where: { id: dealId, orgId: ctx.orgId } });
  if (!deal) return NextResponse.json({ error: "Negócio não encontrado." }, { status: 404 });

  await prisma.deal.delete({ where: { id: deal.id } });
  return NextResponse.json({ ok: true });
}
