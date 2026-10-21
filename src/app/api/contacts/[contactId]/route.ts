import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { emitirEventoDeContato } from "@/lib/server/webhooks/emitir";
import { requirePermission } from "@/lib/server/permissions";
import { filtroDeEscopo } from "@/lib/server/escopo-dados";
import { applyTag, removeTag, optOutContact, filtroDeTelefone, telefoneParaGravar } from "@/lib/server/contacts";
import {
  conferirReferencias,
  erro,
  JSON_INVALIDO,
  lerCorpo,
  respostaDeErroDoPrisma,
} from "@/lib/server/api-validacao";
import { validarEmail } from "@/lib/capture-validation";
import { serializeContact } from "@/lib/server/contact-dto";
import { responderExclusao } from "@/lib/server/lixeira-http";
import { mesclarCamposDeContato } from "@/lib/server/custom-fields";
import type { Prisma } from "@/generated/prisma/client";

const INCLUDE = {
  tags: { include: { tag: true } },
  channels: true,
  company: { select: { id: true, name: true } },
} as const;

export async function GET(_request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const ctx = await requirePermission("contatos:ver");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { contactId } = await params;

  const contact = await prisma.contact.findFirst({
    where: { id: contactId, orgId: ctx.orgId, ...(await filtroDeEscopo(ctx, "contatos")) },
    include: INCLUDE,
  });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  // Tudo que compõe a ficha de uma vez: a tela abre sem cascata de chamadas.
  // Cada lista também é presa à org (defesa extra: o contato já é da org,
  // mas um vínculo cruzado por bug não pode vazar dado de outra conta).
  const [conversations, enrollments, deals, tasks, notes] = await Promise.all([
    prisma.conversation.findMany({
      where: { contactRecordId: contact.id, agent: { orgId: ctx.orgId } },
      select: { id: true, channel: true, status: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 10,
    }),
    prisma.sequenceEnrollment.findMany({
      where: { contactId: contact.id, sequence: { agent: { orgId: ctx.orgId } } },
      include: { sequence: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.dealContact.findMany({
      where: { contactId: contact.id, deal: { orgId: ctx.orgId } },
      include: { deal: { include: { stage: true, pipeline: { select: { name: true } } } } },
    }),
    prisma.task.findMany({
      where: { contactId: contact.id, orgId: ctx.orgId },
      // Abertas primeiro (doneAt null), depois por prazo.
      orderBy: [{ doneAt: { sort: "asc", nulls: "first" } }, { dueAt: "asc" }],
      take: 20,
    }),
    prisma.note.findMany({
      where: { contactId: contact.id, orgId: ctx.orgId },
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
  const ctx = await requirePermission("contatos:editar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { contactId } = await params;

  const contact = await prisma.contact.findFirst({ where: { id: contactId, orgId: ctx.orgId, ...(await filtroDeEscopo(ctx, "contatos")) } });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);

  // Valida tudo antes de mexer em qualquer coisa (etiqueta, opt-out), pra não
  // deixar a ficha meio salva quando um campo vem errado.
  const data: Prisma.ContactUpdateInput = {};
  if (typeof body.name === "string") data.name = body.name.trim();
  if (typeof body.email === "string") {
    const bruto = body.email.trim();
    const email = bruto ? validarEmail(bruto) : "";
    if (email === null) return erro("E-mail inválido.");
    data.email = email;
  }
  if (typeof body.phone === "string") {
    const phone = telefoneParaGravar(body.phone);
    if (phone === null) return erro("Telefone inválido. Informe com DDD.");
    data.phone = phone;
  }

  // Mesma regra do cadastro: e-mail/telefone de outra ficha da org é conflito.
  const email = typeof data.email === "string" ? data.email : "";
  const porTelefone = typeof data.phone === "string" ? filtroDeTelefone(data.phone) : null;
  if ((email && email !== contact.email.toLowerCase()) || (porTelefone && data.phone !== contact.phone)) {
    const dupe = await prisma.contact.findFirst({
      where: {
        orgId: ctx.orgId,
        id: { not: contact.id },
        OR: [
          ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
          ...(porTelefone ? [porTelefone] : []),
        ],
      },
      select: { id: true, name: true },
    });
    if (dupe) {
      return NextResponse.json(
        { error: `Já existe um contato com esse e-mail ou telefone: ${dupe.name || dupe.id}.`, existingId: dupe.id },
        { status: 409 }
      );
    }
  }

  const refErro = await conferirReferencias(ctx.orgId, { companyId: body.companyId, ownerId: body.ownerId });
  if (refErro) return erro(refErro, refErro.endsWith("inválido.") ? 400 : 404);

  if (body.customFields && typeof body.customFields === "object") {
    const r = await mesclarCamposDeContato(
      ctx.orgId,
      (contact.customFields ?? {}) as Record<string, unknown>,
      body.customFields as Record<string, unknown>
    );
    if (!r.ok) return NextResponse.json({ error: r.erros.join(" "), erros: r.erros }, { status: 400 });
    data.customFields = r.valores as Prisma.InputJsonValue;
  }

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
  if (body.optIn === true) data.optIn = true;

  if (Object.keys(data).length > 0) {
    try {
      await prisma.contact.update({ where: { id: contact.id }, data });
    } catch (e) {
      // P2025 = contato (ou empresa/responsável) sumiu no meio do caminho.
      return respostaDeErroDoPrisma(e);
    }
    await emitirEventoDeContato(ctx.orgId, contact.id, "contact.updated");
  }

  const updated = await prisma.contact.findFirst({
    where: { id: contactId, orgId: ctx.orgId },
    include: INCLUDE,
  });
  return NextResponse.json({ contact: updated ? serializeContact(updated) : null });
}

// Vai para a lixeira (30 dias): canais, etiquetas, tarefas, notas e vínculos na foto.
export async function DELETE(request: Request, { params }: { params: Promise<{ contactId: string }> }) {
  const ctx = await requirePermission("contatos:apagar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { contactId } = await params;

  const contact = await prisma.contact.findFirst({ where: { id: contactId, orgId: ctx.orgId, ...(await filtroDeEscopo(ctx, "contatos")) } });
  if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

  return responderExclusao(request, ctx, "contact", contact.id);
}
