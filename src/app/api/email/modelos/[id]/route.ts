import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { prisma } from "@/lib/db/prisma";
import { lerModelo } from "../validar";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const lido = lerModelo(await request.json().catch(() => null));
  if ("error" in lido) return NextResponse.json({ error: lido.error }, { status: 400 });
  const r = await prisma.emailModelo.updateMany({ where: { id, orgId: ctx.orgId }, data: lido });
  if (r.count === 0) return NextResponse.json({ error: "Modelo não encontrado." }, { status: 404 });
  return NextResponse.json({ modelo: await prisma.emailModelo.findFirst({ where: { id, orgId: ctx.orgId } }) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("integracoes:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  await prisma.emailModelo.deleteMany({ where: { id, orgId: ctx.orgId } });
  return NextResponse.json({ ok: true });
}
