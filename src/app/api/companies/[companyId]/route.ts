import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Ficha da empresa: dados, quem trabalha lá, negócios, tarefas e notas.
 *
 * Tarefas e notas não têm `companyId` no schema — elas apontam para contato ou
 * negócio. Então aqui vêm por tabela, via os contatos e os negócios da empresa,
 * que é o que alguém quer dizer com "o que está aberto nessa conta".
 */
export async function GET(_request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { companyId } = await params;

  const company = await prisma.company.findFirst({
    where: { id: companyId, orgId: ctx.orgId },
    include: {
      owner: { select: { id: true, name: true } },
      contacts: {
        select: { id: true, name: true, jobTitle: true, email: true, phone: true },
        orderBy: { name: "asc" },
      },
      deals: {
        include: { stage: { select: { name: true, type: true } }, pipeline: { select: { name: true } } },
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const contactIds = company.contacts.map((c) => c.id);
  const dealIds = company.deals.map((d) => d.id);

  const [tasks, notes] = await Promise.all([
    prisma.task.findMany({
      where: {
        orgId: ctx.orgId,
        OR: [{ contactId: { in: contactIds } }, { dealId: { in: dealIds } }],
      },
      include: { contact: { select: { id: true, name: true } }, deal: { select: { id: true, name: true } } },
      orderBy: [{ doneAt: "asc" }, { dueAt: "asc" }],
      take: 30,
    }),
    prisma.note.findMany({
      where: {
        orgId: ctx.orgId,
        OR: [{ contactId: { in: contactIds } }, { dealId: { in: dealIds } }],
      },
      include: { contact: { select: { id: true, name: true } }, deal: { select: { id: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);

  // Aberto x ganho, que é a única leitura que interessa numa conta.
  const abertos = company.deals.filter((d) => !d.closedAt && !d.archivedAt);
  const ganhos = company.deals.filter((d) => d.stage.type === "won");

  return NextResponse.json({
    company: {
      id: company.id,
      name: company.name,
      cnpj: company.cnpj,
      sector: company.sector,
      size: company.size,
      website: company.website,
      phone: company.phone,
      linkedinUrl: company.linkedinUrl,
      address: company.address,
      city: company.city,
      uf: company.uf,
      zipcode: company.zipcode,
      description: company.description,
      revenue: company.revenue,
      owner: company.owner,
      createdAt: company.createdAt.toISOString(),
    },
    totals: {
      openCount: abertos.length,
      openCents: abertos.reduce((soma, d) => soma + d.amountCents, 0),
      wonCents: ganhos.reduce((soma, d) => soma + d.amountCents, 0),
    },
    contacts: company.contacts,
    deals: company.deals.map((d) => ({
      id: d.id,
      name: d.name,
      amountCents: d.amountCents,
      probability: d.probability,
      stage: d.stage.name,
      stageType: d.stage.type,
      pipeline: d.pipeline.name,
      closedAt: d.closedAt?.toISOString() ?? null,
      updatedAt: d.updatedAt.toISOString(),
    })),
    tasks: tasks.map((t) => ({
      id: t.id,
      text: t.text,
      dueAt: t.dueAt?.toISOString() ?? null,
      doneAt: t.doneAt?.toISOString() ?? null,
      contact: t.contact,
      deal: t.deal,
    })),
    notes: notes.map((n) => ({
      id: n.id,
      text: n.text,
      createdAt: n.createdAt.toISOString(),
      contact: n.contact,
      deal: n.deal,
    })),
  });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { companyId } = await params;

  const company = await prisma.company.findFirst({ where: { id: companyId, orgId: ctx.orgId } });
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  const body = await request.json();
  const data: Prisma.CompanyUpdateInput = {};

  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  for (const campo of ["sector", "website", "phone", "linkedinUrl", "address", "city", "description", "revenue", "zipcode"] as const) {
    if (typeof body[campo] === "string") data[campo] = body[campo];
  }
  if (typeof body.uf === "string") data.uf = body.uf.toUpperCase().slice(0, 2);
  if (body.size !== undefined) data.size = body.size ? Number(body.size) : null;

  if (typeof body.cnpj === "string") {
    const cnpj = body.cnpj.replace(/\D/g, "");
    // Mesma regra do cadastro: CNPJ preenchido é chave única na organização.
    if (cnpj) {
      const dupe = await prisma.company.findFirst({
        where: { orgId: ctx.orgId, cnpj, id: { not: company.id } },
      });
      if (dupe) {
        return NextResponse.json({ error: `Já existe uma empresa com esse CNPJ: ${dupe.name}.` }, { status: 409 });
      }
    }
    data.cnpj = cnpj;
  }

  if (body.ownerId !== undefined) {
    data.owner = body.ownerId ? { connect: { id: String(body.ownerId) } } : { disconnect: true };
  }

  if (Object.keys(data).length > 0) {
    await prisma.company.update({ where: { id: company.id }, data });
  }

  // Vincular ou desvincular pessoa da conta, sem precisar abrir o contato.
  if (typeof body.addContactId === "string" && body.addContactId) {
    await prisma.contact.updateMany({
      where: { id: body.addContactId, orgId: ctx.orgId },
      data: { companyId: company.id },
    });
  }
  if (typeof body.removeContactId === "string" && body.removeContactId) {
    await prisma.contact.updateMany({
      where: { id: body.removeContactId, orgId: ctx.orgId, companyId: company.id },
      data: { companyId: null },
    });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { companyId } = await params;

  const company = await prisma.company.findFirst({ where: { id: companyId, orgId: ctx.orgId } });
  if (!company) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });

  // Contato e negócio não são apagados junto: a relação é SetNull no schema,
  // e perder o histórico de venda por causa de uma limpeza de cadastro seria
  // um estrago que ninguém consegue desfazer.
  await prisma.company.delete({ where: { id: company.id } });
  return NextResponse.json({ ok: true });
}
