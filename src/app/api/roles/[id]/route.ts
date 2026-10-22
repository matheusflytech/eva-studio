import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { dadosDoPapel, type Corpo } from "@/lib/server/papeis";
import { lerCorpo, JSON_INVALIDO } from "@/lib/server/api-validacao";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const ctx = await requirePermission("membros:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const atual = await prisma.customRole.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true } });
  if (!atual) return NextResponse.json({ error: "Papel não encontrado." }, { status: 404 });

  const body = await lerCorpo(request);
  if (!body) return NextResponse.json({ error: JSON_INVALIDO }, { status: 400 });
  const r = await dadosDoPapel(ctx.orgId, body as Corpo, false);
  if ("erro" in r) return NextResponse.json({ error: r.erro }, { status: 400 });

  const papel = await prisma.customRole.update({ where: { id }, data: r.dados });
  return NextResponse.json({ papel });
}

// Apagar o papel não tira ninguém do contrato: quem tinha volta ao papel de
// sistema que já estava no vínculo (roleId vira null pela FK).
export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await requirePermission("membros:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const { count } = await prisma.customRole.deleteMany({ where: { id, orgId: ctx.orgId } });
  if (count === 0) return NextResponse.json({ error: "Papel não encontrado." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
