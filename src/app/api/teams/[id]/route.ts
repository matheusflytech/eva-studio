import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { membrosValidos, nomeValido } from "@/lib/server/papeis";
import { lerCorpo, JSON_INVALIDO } from "@/lib/server/api-validacao";
import { ehMembroDoContrato } from "@/lib/server/contratos";

type Params = { params: Promise<{ id: string }> };

// Nome, líder e membros (memberIds substitui a lista inteira).
export async function PATCH(request: Request, { params }: Params) {
  const ctx = await requirePermission("membros:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const atual = await prisma.team.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true, leaderId: true } });
  if (!atual) return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });

  const body = await lerCorpo(request);
  if (!body) return NextResponse.json({ error: JSON_INVALIDO }, { status: 400 });

  const data: { name?: string; leaderId?: string | null } = {};
  if (body.name !== undefined) {
    const n = nomeValido(body.name);
    if (!n) return NextResponse.json({ error: "Dê um nome à equipe (até 80 caracteres)." }, { status: 400 });
    data.name = n;
  }
  if (body.leaderId !== undefined) {
    const l = typeof body.leaderId === "string" && body.leaderId ? body.leaderId : null;
    if (l && !(await ehMembroDoContrato(ctx.orgId, l))) {
      return NextResponse.json({ error: "Líder não encontrado neste contrato." }, { status: 404 });
    }
    data.leaderId = l;
  }

  let memberIds: string[] | undefined;
  if (body.memberIds !== undefined) {
    memberIds = await membrosValidos(ctx.orgId, body.memberIds);
    const lider = data.leaderId !== undefined ? data.leaderId : atual.leaderId;
    if (lider && !memberIds.includes(lider)) memberIds.push(lider);
  }

  await prisma.$transaction([
    prisma.team.update({ where: { id }, data }),
    ...(memberIds
      ? [
          prisma.teamMember.deleteMany({ where: { teamId: id, userId: { notIn: memberIds } } }),
          ...memberIds.map((userId) =>
            prisma.teamMember.upsert({ where: { teamId_userId: { teamId: id, userId } }, create: { teamId: id, userId }, update: {} })
          ),
        ]
      : []),
  ]);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: Params) {
  const ctx = await requirePermission("membros:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;
  const { count } = await prisma.team.deleteMany({ where: { id, orgId: ctx.orgId } });
  if (count === 0) return NextResponse.json({ error: "Equipe não encontrada." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
