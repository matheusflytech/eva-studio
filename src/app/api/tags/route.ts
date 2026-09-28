import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";

// Etiquetas da organização. A contagem de contatos vem junto porque é a
// informação que faz a tela ser útil: etiqueta com zero contato costuma ser
// lixo de teste que dá pra apagar.
export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const tags = await prisma.tag.findMany({
    where: { orgId: ctx.orgId },
    include: { _count: { select: { contacts: true } } },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({
    tags: tags.map((t) => ({ id: t.id, name: t.name, color: t.color, contactCount: t._count.contacts })),
  });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("contacts:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json();
  const name = String(body.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "Nome da etiqueta é obrigatório." }, { status: 400 });

  const existing = await prisma.tag.findUnique({ where: { orgId_name: { orgId: ctx.orgId, name } } });
  if (existing) return NextResponse.json({ error: "Já existe uma etiqueta com esse nome." }, { status: 409 });

  const tag = await prisma.tag.create({
    data: { orgId: ctx.orgId, name, color: String(body.color ?? "slate") },
  });
  return NextResponse.json({ tag: { id: tag.id, name: tag.name, color: tag.color, contactCount: 0 } });
}
