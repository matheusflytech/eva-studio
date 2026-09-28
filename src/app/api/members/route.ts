import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission, getSessionContext, isRole, ROLE_LABELS, ROLE_DESCRIPTIONS } from "@/lib/server/permissions";

// Membros da organização e seus papéis. Qualquer um logado pode ver quem está
// no time (é informação de equipe, não segredo); só quem tem "org:manage"
// muda papel.
export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const members = await prisma.profile.findMany({
    where: { orgId: ctx.orgId },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({
    me: { userId: ctx.userId, role: ctx.role },
    roles: (Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((r) => ({
      value: r,
      label: ROLE_LABELS[r],
      description: ROLE_DESCRIPTIONS[r],
    })),
    members: members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      role: isRole(m.role) ? m.role : "owner",
      createdAt: m.createdAt.toISOString(),
      isMe: m.id === ctx.userId,
    })),
  });
}

export async function PATCH(request: Request) {
  const ctx = await requirePermission("org:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const { userId, role } = await request.json();
  if (!userId || !isRole(role)) {
    return NextResponse.json({ error: "userId e role válidos são obrigatórios." }, { status: 400 });
  }

  const target = await prisma.profile.findFirst({ where: { id: String(userId), orgId: ctx.orgId } });
  if (!target) return NextResponse.json({ error: "Membro não encontrado." }, { status: 404 });

  // Duas travas contra a organização ficar sem dono:
  //  - ninguém se rebaixa sozinho (perderia o acesso no próprio clique)
  //  - não dá pra rebaixar o último owner
  if (target.id === ctx.userId && role !== "owner") {
    return NextResponse.json({ error: "Você não pode rebaixar o próprio acesso." }, { status: 400 });
  }
  if (target.role === "owner" && role !== "owner") {
    const owners = await prisma.profile.count({ where: { orgId: ctx.orgId, role: "owner" } });
    if (owners <= 1) {
      return NextResponse.json({ error: "A organização precisa de pelo menos um dono." }, { status: 400 });
    }
  }

  await prisma.profile.update({ where: { id: target.id }, data: { role } });
  return NextResponse.json({ ok: true });
}
