import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { caminhoDaOrg } from "@/lib/server/storage";
import { lerModelo } from "@/lib/disparos/modelo";
import type { Prisma } from "@/generated/prisma/client";

// Editar (PUT, mesmo corpo do POST) ou apagar (DELETE) um modelo do contrato.

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("broadcasts:send");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const r = lerModelo(await request.json().catch(() => null), (p) => caminhoDaOrg(p, ctx.orgId));
  if (!r.ok) return NextResponse.json({ error: r.erro }, { status: 400 });
  const feito = await prisma.broadcastTemplate.updateMany({
    where: { id, orgId: ctx.orgId },
    data: { ...r.modelo, options: r.modelo.options as unknown as Prisma.InputJsonValue },
  });
  if (feito.count === 0) return NextResponse.json({ error: "Modelo não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("broadcasts:send");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const feito = await prisma.broadcastTemplate.deleteMany({ where: { id, orgId: ctx.orgId } });
  if (feito.count === 0) return NextResponse.json({ error: "Modelo não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
