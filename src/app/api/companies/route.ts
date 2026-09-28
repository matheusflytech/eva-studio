import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import type { Prisma } from "@/generated/prisma/client";

export async function GET(request: Request) {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  const where: Prisma.CompanyWhereInput = q
    ? {
        orgId: ctx.orgId,
        OR: [
          { name: { contains: q, mode: "insensitive" } },
          { cnpj: { contains: q } },
          { sector: { contains: q, mode: "insensitive" } },
        ],
      }
    : { orgId: ctx.orgId };

  const companies = await prisma.company.findMany({
    where,
    include: {
      owner: { select: { id: true, name: true } },
      _count: { select: { contacts: true, deals: true } },
    },
    orderBy: { name: "asc" },
    take: 200,
  });

  return NextResponse.json({
    companies: companies.map((c) => ({
      id: c.id,
      name: c.name,
      cnpj: c.cnpj,
      sector: c.sector,
      website: c.website,
      phone: c.phone,
      city: c.city,
      uf: c.uf,
      owner: c.owner,
      contactCount: c._count.contacts,
      dealCount: c._count.deals,
      createdAt: c.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Nome da empresa é obrigatório." }, { status: 400 });

  const cnpj = String(body.cnpj ?? "").replace(/\D/g, "");

  // CNPJ é o identificador natural de empresa no Brasil. Quando vem
  // preenchido, vale como chave de deduplicação — nome repete, CNPJ não.
  if (cnpj) {
    const dupe = await prisma.company.findFirst({ where: { orgId: ctx.orgId, cnpj } });
    if (dupe) {
      return NextResponse.json(
        { error: `Já existe uma empresa com esse CNPJ: ${dupe.name}.`, existingId: dupe.id },
        { status: 409 }
      );
    }
  }

  const company = await prisma.company.create({
    data: {
      orgId: ctx.orgId,
      name,
      cnpj,
      sector: String(body.sector ?? ""),
      size: body.size ? Number(body.size) : null,
      website: String(body.website ?? ""),
      phone: String(body.phone ?? ""),
      linkedinUrl: String(body.linkedinUrl ?? ""),
      address: String(body.address ?? ""),
      city: String(body.city ?? ""),
      uf: String(body.uf ?? "").toUpperCase().slice(0, 2),
      zipcode: String(body.zipcode ?? ""),
      description: String(body.description ?? ""),
      revenue: String(body.revenue ?? ""),
      ownerId: body.ownerId || ctx.userId,
    },
  });

  return NextResponse.json({ company: { id: company.id, name: company.name } });
}
