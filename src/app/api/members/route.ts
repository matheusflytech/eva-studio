import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission, ROLE_LABELS, ROLE_DESCRIPTIONS, ctxPode } from "@/lib/server/permissions";
import { ErroDeMembro, alterarMembro, convidarMembro, listarMembros, removerMembro } from "@/lib/server/membros";

// Membros do contrato ativo e seus papéis. Qualquer um do contrato vê quem
// está no time (é informação de equipe, não segredo); convidar, mudar papel,
// grupos, equipes e remover exige "membros:gerenciar" (o antigo org:manage).

function falha(e: unknown) {
  if (e instanceof ErroDeMembro) return NextResponse.json({ error: e.message }, { status: e.status });
  throw e;
}

export async function GET() {
  const ctx = await requirePermission("read");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const [members, papeis] = await Promise.all([
    listarMembros(ctx.orgId),
    prisma.customRole
      .findMany({ where: { orgId: ctx.orgId }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      .catch(() => [] as { id: string; name: string }[]),
  ]);

  return NextResponse.json({
    me: {
      userId: ctx.userId,
      role: ctx.role,
      papelId: ctx.papelId ?? null,
      podeGerenciar: ctxPode(ctx, "membros:gerenciar"),
      superadmin: !!ctx.superadmin,
    },
    roles: (Object.keys(ROLE_LABELS) as (keyof typeof ROLE_LABELS)[]).map((r) => ({
      value: r,
      label: ROLE_LABELS[r],
      description: ROLE_DESCRIPTIONS[r],
    })),
    customRoles: papeis,
    members: members.map((m) => ({ ...m, isMe: m.id === ctx.userId })),
  });
}

// Convida por e-mail (conta existente ganha o vínculo; conta nova recebe o
// convite do Supabase).
export async function POST(request: Request) {
  const ctx = await requirePermission("membros:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  try {
    const convite = await convidarMembro(ctx, body, new URL(request.url).origin);
    return NextResponse.json({ ok: true, convite }, { status: 201 });
  } catch (e) {
    return falha(e);
  }
}

// Papel de sistema, papel personalizado, grupos e equipes de um membro.
export async function PATCH(request: Request) {
  const ctx = await requirePermission("membros:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  try {
    await alterarMembro(ctx, body);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return falha(e);
  }
}

// Tira a pessoa do contrato (?userId=). Os dados que ela criou ficam.
export async function DELETE(request: Request) {
  const ctx = await requirePermission("membros:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  try {
    await removerMembro(ctx, new URL(request.url).searchParams.get("userId") ?? "");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return falha(e);
  }
}
