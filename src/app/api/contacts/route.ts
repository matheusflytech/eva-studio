import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { mesclarCamposDeContato } from "@/lib/server/custom-fields";
import { requirePermission } from "@/lib/server/permissions";
import { filtroDeEscopo } from "@/lib/server/escopo-dados";
import { buildSegmentWhere, parseRules } from "@/lib/server/segments";
import { serializeContact } from "@/lib/server/contact-dto";
import { CANAIS_DE_CONTATO, externalIdDoCanal, filtroDeTelefone, telefoneParaGravar } from "@/lib/server/contacts";
import {
  conferirReferencias,
  erro,
  JSON_INVALIDO,
  lerCorpo,
  respostaDeErroDoPrisma,
} from "@/lib/server/api-validacao";
import { validarEmail } from "@/lib/capture-validation";
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
  const ctx = await requirePermission("contatos:ver");
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
    // "(11) 99999-8888" também acha quem está gravado como 5511999998888.
    const digitos = q.replace(/\D/g, "");
    const porDigitos: Prisma.ContactWhereInput[] =
      digitos.length >= 4 && digitos !== q
        ? [
            { phone: { contains: digitos } },
            { channels: { some: { externalId: { contains: digitos } } } },
          ]
        : [];
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { channels: { some: { externalId: { contains: q, mode: "insensitive" } } } },
        ...porDigitos,
      ],
    });
  }
  if (tagId) and.push({ tags: { some: { tagId } } });
  if (companyId) and.push({ companyId });
  // Escopo do papel: "só os meus" / "da minha equipe" (vazio = todos).
  const escopo = await filtroDeEscopo(ctx, "contatos");
  if (Object.keys(escopo).length > 0) and.push(escopo);
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
  const ctx = await requirePermission("contatos:criar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await lerCorpo(request);
  if (!body) return erro(JSON_INVALIDO);
  const name = String(body.name ?? "").trim();
  const emailBruto = String(body.email ?? "").trim();
  const email = emailBruto ? validarEmail(emailBruto) : "";
  if (email === null) return erro("E-mail inválido.");
  const phone = telefoneParaGravar(body.phone);
  if (phone === null) return erro("Telefone inválido. Informe com DDD.");

  if (!name && !email && !phone) {
    return NextResponse.json({ error: "Informe pelo menos nome, e-mail ou telefone." }, { status: 400 });
  }

  // Canal opcional no cadastro manual: dá pra criar a ficha antes de saber
  // por onde falar com a pessoa. Sem externalId, o telefone faz o papel.
  const agentId = typeof body.agentId === "string" ? body.agentId.trim() : "";
  const channel = typeof body.channel === "string" ? body.channel.trim() : "";
  let externalId: string | null = null;
  if (agentId && channel) {
    if (!CANAIS_DE_CONTATO.has(channel)) return erro("Canal inválido.");
    const bruto = body.externalId !== undefined && body.externalId !== "" ? body.externalId : phone;
    if (bruto) {
      externalId = externalIdDoCanal(channel, bruto);
      if (!externalId) return erro("Identificador do canal inválido.");
    }
  }

  // Tudo que aponta pra outro registro precisa ser da mesma organização: o
  // agentId vira ContactChannel, e aceitar o de outra org seria sequestrar o
  // canal dela.
  const refErro = await conferirReferencias(ctx.orgId, {
    companyId: body.companyId,
    ownerId: body.ownerId,
    agentId: externalId ? agentId : undefined,
  });
  if (refErro) return erro(refErro, refErro.endsWith("inválido.") ? 400 : 404);

  // Não cria duplicata na cara do usuário: se já existe alguém com esse
  // e-mail ou telefone na org, devolve conflito em vez de sujar a base.
  const porTelefone = filtroDeTelefone(phone);
  const dupe = await prisma.contact.findFirst({
    where: {
      orgId: ctx.orgId,
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

  let customFields: Record<string, unknown> = {};
  if (body.customFields && typeof body.customFields === "object") {
    const r = await mesclarCamposDeContato(ctx.orgId, {}, body.customFields as Record<string, unknown>);
    if (!r.ok) return NextResponse.json({ error: r.erros.join(" "), erros: r.erros }, { status: 400 });
    customFields = r.valores;
  }

  try {
    const contact = await prisma.contact.create({
      data: {
        orgId: ctx.orgId,
        name,
        email,
        phone,
        jobTitle: String(body.jobTitle ?? ""),
        companyId: typeof body.companyId === "string" && body.companyId ? body.companyId : null,
        ownerId: typeof body.ownerId === "string" && body.ownerId ? body.ownerId : null,
        notes: String(body.notes ?? ""),
        customFields: customFields as Prisma.InputJsonValue,
        source: "manual",
        channels: externalId ? { create: { agentId, channel, externalId } } : undefined,
      },
      include: {
        tags: { include: { tag: true } },
        channels: true,
        company: { select: { id: true, name: true } },
      },
    });
    return NextResponse.json({ contact: serializeContact(contact) });
  } catch (e) {
    // P2002 = esse canal (agente + id externo) já é de outra ficha.
    return respostaDeErroDoPrisma(e);
  }
}
