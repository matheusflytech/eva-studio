import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { applyTag, removeTag, optOutContact } from "@/lib/server/contacts";
import { serializeContact } from "@/lib/server/contact-dto";
import type { Prisma } from "@/generated/prisma/client";

const INCLUDE = {
  tags: { include: { tag: true } },
  channels: true,
  company: { select: { id: true, name: true } },
} as const;

export async function GET(_request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { contactId } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, orgId: ctx.orgId },
    include: INCLUDE,
  });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  // Tudo que compõe a ficha de uma vez: a tela abre sem cascata de chamadas.
  const [conversations, enrollments, deals, tasks, notes] = await Promise.all([
    prisma.conversation.findMany({
      where: { contactRecordId: contact.id },
      select: { id: true, channel: true, status: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.sequenceEnrollment.findMany({
      where: { contactId: contact.id },
      include: { sequence: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.dealContact.findMany({
      where: { contactId: contact.id },
      include: { deal: { include: { stage: true, pipeline: { select: { name: true } } } } },
    }),
    prisma.task.findMany({
      where: { contactId: contact.id },
      orderBy: [{ doneAt: "asc" }, { dueAt: "asc" }],
      take: 20,
    }),
    prisma.note.findMany({
      where: { contactId: contact.id },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return NextResponse.json({
    contact: serializeContact(contact),
    conversations: conversations.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() })),
    enrollments: enrollments.map((e) => ({
      id: e.id,
      sequenceName: e.sequence.name,
      currentStep: e.currentStep,
      status: e.status,
      stoppedReason: e.stoppedReason,
      nextRunAt: e.nextRunAt.toISOString(),
    })),
    deals: deals.map((d) => ({
      id: d.deal.id,
      name: d.deal.name,
      amountCents: d.deal.amountCents,
      stage: d.deal.stage.name,
      stageType: d.deal.stage.type,
      pipeline: d.deal.pipeline.name,
      closedAt: d.deal.closedAt?.toISOString() ?? null,
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      type: t.type,
      text: t.text,
      dueAt: t.dueAt?.toISOString() ?? null,
      doneAt: t.doneAt?.toISOString() ?? null,
    })),
    notes: notes.map((n) => ({ id: n.id, text: n.text, createdAt: n.createdAt.toISOString() })),
  });
}

// PATCH aceita, além dos campos da ficha:
//   addTagId / removeTagId — etiquetar (addTagId passa por applyTag, que é o
//                            que dispara auto-enrollment de sequência)
//   optIn: false           — opt-out de verdade: para toda régua ativa
export async function PATCH(request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { contactId } = await params;

  const contact = await prisma.contact.findFirst({ where: { id: contactId, orgId: ctx.orgId } });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  const body = await request.json();

  if (typeof body.addTagId === "string" && body.addTagId) {
    const tag = await prisma.tag.findFirst({ where: { id: body.addTagId, orgId: ctx.orgId } });
    if (!tag) return NextResponse.json({ error: "Etiqueta não encontrada." }, { status: 404 });
    await applyTag(contact.id, tag.id);
  }
  if (typeof body.removeTagId === "string" && body.removeTagId) {
    await removeTag(contact.id, body.removeTagId);
  }
  if (body.optIn === false && contact.optIn) {
    await optOutContact(contact.id);
  }

  const data: Prisma.ContactUpdateInput = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.email === "string") data.email = body.email.trim();
  if (typeof body.phone === "string") data.phone = body.phone.trim();
  if (typeof body.jobTitle === "string") data.jobTitle = body.jobTitle.trim();
  if (typeof body.linkedinUrl === "string") data.linkedinUrl = body.linkedinUrl.trim();
  if (typeof body.background === "string") data.background = body.background;
  if (typeof body.notes === "string") data.notes = body.notes;
  if (body.companyId !== undefined) {
    data.company = body.companyId ? { connect: { id: String(body.companyId) } } : { disconnect: true };
  }
  if (body.ownerId !== undefined) {
    data.owner = body.ownerId ? { connect: { id: String(body.ownerId) } } : { disconnect: true };
  }
  if (body.customFields && typeof body.customFields === "object") {
    data.customFields = body.customFields as Prisma.InputJsonValue;
  }
  if (body.optIn === true) data.optIn = true;

  if (Object.keys(data).length > 0) {
    await prisma.contact.update({ where: { id: contact.id }, data });
  }

  const updated = await prisma.contact.findFirst({
    where: { id: contactId, orgId: ctx.orgId },
    include: INCLUDE,
  });
  return NextResponse.json({ contact: updated ? serializeContact(updated) : null });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { contactId } = await params;

  const contact = await prisma.contact.findFirst({ where: { id: contactId, orgId: ctx.orgId } });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  await prisma.contact.delete({ where: { id: contact.id } });
  return NextResponse.json({ ok: true });
}
