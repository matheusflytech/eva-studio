import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

// Revoga (não apaga a linha — mantém histórico de quando existiu e foi
// revogada, mesma lógica de qualquer API séria: uma chave revogada some da
// lista de "ativas" mas não vira um buraco silencioso no histórico).
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;

  const key = await prisma.apiKey.findFirst({ where: { id, orgId } });
  if (!key) return NextResponse.json({ error: "Chave não encontrada." }, { status: 404 });

  await prisma.apiKey.update({ where: { id }, data: { revokedAt: new Date() } });
  return NextResponse.json({ ok: true });
}
