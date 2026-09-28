import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { buildSegmentWhere, parseRules } from "@/lib/server/segments";
import { serializeContact } from "@/lib/server/contact-dto";
import { normalizePhone } from "@/lib/server/contacts";
import type { Prisma } from "@/generated/prisma/client";

const PAGE_SIZE = 50;

// Contatos da ORGANIZAÇÃO (não mais por agente): o contato é a pessoa, e uma
// pessoa que fala com dois agentes é uma ficha só. Onde falar com ela mora em
// ContactChannel. Ver §13 e §24 do CHATBOT_ENGINE.md.
//
//   ?q=texto        busca em nome/e-mail/telefone
//   ?tag=<tagId>
//   ?segment=<id>
//   ?company=<id>
//   ?page=1
export async function GET(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const url = new URL(request.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const tagId = url.searchParams.get("tag")?.trim() ?? "";
  const segmentId = url.searchParams.get("segment")?.trim() ?? "";
  const companyId = url.searchParams.get("company")?.trim() ?? "";
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);

  let where: Prisma.ContactWhereInput = { orgId: ctx.orgId };

  if (segmentId) {
    const segment = await prisma.segment.findFirst({ where: { id: segmentId, orgId: ctx.orgId } });
    if (segment) where = buildSegmentWhere(ctx.orgId, segment.match, parseRules(segment.rules));
  }

  const and: Prisma.ContactWhereInput[] = [];
  if (q) {
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { channels: { some: { externalId: { contains: q, mode: "insensitive" } } } },
      ],
    });
  }
  if (tagId) and.push({ tags: { some: { tagId } } });
  if (companyId) and.push({ companyId });
  if (and.length > 0) where = { AND: [where, ...and] };

  const [total, rows] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where,
      include: {
        tags: { include: { tag: true } },
        channels: true,
        company: { select: { id: true, name: true } },
      },
      orderBy: { lastSeenAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);

  return NextResponse.json({
    total,
    page,
    pageSize: PAGE_SIZE,
    contacts: rows.map(serializeContact),
  });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim();
  const phone = String(body.phone ?? "").trim();

  if (!name && !email && !phone) {
    return NextResponse.json({ error: "Informe pelo menos nome, e-mail ou telefone." }, { status: 400 });
  }

  // Não cria duplicata na cara do usuário: se já existe alguém com esse
  // e-mail ou telefone na org, devolve conflito em vez de sujar a base.
  const phoneKey = normalizePhone(phone);
  const dupe = await prisma.contact.findFirst({
    where: {
      orgId: ctx.orgId,
      OR: [
        ...(email ? [{ email: { equals: email, mode: "insensitive" as const } }] : []),
        ...(phoneKey.length >= 10 ? [{ phone: { contains: phoneKey } }] : []),
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

  const contact = await prisma.contact.create({
    data: {
      orgId: ctx.orgId,
      name,
      email,
      phone,
      jobTitle: String(body.jobTitle ?? ""),
      companyId: body.companyId || null,
      ownerId: body.ownerId || null,
      notes: String(body.notes ?? ""),
      customFields: (body.customFields ?? {}) as Prisma.InputJsonValue,
      source: "manual",
      // Canal opcional no cadastro manual: dá pra criar a ficha antes de
      // saber por onde falar com a pessoa.
      channels:
        body.agentId && body.channel && body.externalId
          ? { create: { agentId: body.agentId, channel: body.channel, externalId: String(body.externalId) } }
          : undefined,
    },
    include: {
      tags: { include: { tag: true } },
      channels: true,
      company: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({ contact: serializeContact(contact) });
}
