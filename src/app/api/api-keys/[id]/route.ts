import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";

// Revoga (não apaga a linha — mantém histórico de quando existiu e foi
// revogada, mesma lógica de qualquer API séria: uma chave revogada some da
// lista de "ativas" mas não vira um buraco silencioso no histórico).
// Só quem gerencia chaves (admin/dono), como criar.
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("api:gerenciar");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const key = await prisma.apiKey.findFirst({ where: { id, orgId: ctx.orgId }, select: { id: true } });
  if (!key) return NextResponse.json({ error: "Chave não encontrada." }, { status: 404 });

  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() }, select: { id: true } });
  return NextResponse.json({ ok: true });
}
