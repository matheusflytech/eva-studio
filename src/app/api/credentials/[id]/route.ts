import { NextResponse } from "next/server";
import { requireOrgId } from "@/lib/auth/require-org";
import { prisma } from "@/lib/db/prisma";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const orgId = await requireOrgId();
  if (!orgId) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;

  const credential = await prisma.credential.findFirst({ where: { id, orgId } });
  if (!credential) return NextResponse.json({ error: "Credencial não encontrada." }, { status: 404 });

  await prisma.credential.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
