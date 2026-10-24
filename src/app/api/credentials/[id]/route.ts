import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/server/permissions";
import { prisma } from "@/lib/db/prisma";

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const orgId = ctx.orgId;
  const { id } = await params;

  const credential = await prisma.credential.findFirst({ where: { id, orgId } });
  if (!credential) return NextResponse.json({ error: "Credencial não encontrada." }, { status: 404 });

  await prisma.credential.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
