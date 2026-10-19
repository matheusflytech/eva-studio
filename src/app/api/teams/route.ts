import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { membrosValidos, nomeValido } from "@/lib/server/papeis";
import { lerCorpo, JSON_INVALIDO } from "@/lib/server/api-validacao";
import { ehMembroDoContrato, ehTabelaAusente } from "@/lib/server/contratos";

// Equipes do contrato (nome, membros, líder). Base do escopo de dados "os da
// minha equipe" em negócios, contatos e conversas.
export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const equipes = await prisma.team
    .findMany({
      where: { orgId: ctx.orgId },
      orderBy: { name: "asc" },
      include: { members: { select: { userId: true } } },
    })
    .catch((e) => {
      if (ehTabelaAusente(e)) return [];
      throw e;
    });
  return NextResponse.json({
    equipes: equipes.map((t) => ({ id: t.id, name: t.name, leaderId: t.leaderId, memberIds: t.members.map((m) => m.userId) })),
  });
}

export async function POST(request: Request) {
  const ctx = await requirePermission("membros:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await lerCorpo(request);
  if (!body) return NextResponse.json({ error: JSON_INVALIDO }, { status: 400 });
  const name = nomeValido(body.name);
  if (!name) return NextResponse.json({ error: "Dê um nome à equipe (até 80 caracteres)." }, { status: 400 });

  const leaderId = typeof body.leaderId === "string" && body.leaderId ? body.leaderId : null;
  if (leaderId && !(await ehMembroDoContrato(ctx.orgId, leaderId))) {
    return NextResponse.json({ error: "Líder não encontrado neste contrato." }, { status: 404 });
  }
  const memberIds = await membrosValidos(ctx.orgId, body.memberIds);
  // O líder é da equipe (senão "os da minha equipe" não o incluiria).
  if (leaderId && !memberIds.includes(leaderId)) memberIds.push(leaderId);

  const equipe = await prisma.team.create({
    data: { orgId: ctx.orgId, name, leaderId, members: { create: memberIds.map((userId) => ({ userId })) } },
    include: { members: { select: { userId: true } } },
  });
  return NextResponse.json(
    { equipe: { id: equipe.id, name: equipe.name, leaderId: equipe.leaderId, memberIds: equipe.members.map((m) => m.userId) } },
    { status: 201 }
  );
}
