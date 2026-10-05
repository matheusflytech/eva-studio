import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";

export async function POST(request: Request) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

  const body = await request.json().catch(() => ({}));
  const pedidos: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
  const funis = await prisma.pipeline.findMany({ where: { orgId: ctx.orgId }, select: { id: true }, orderBy: { position: "asc" } });
  const validos = new Set(funis.map((f) => f.id));
  const ordem = [...pedidos.filter((i) => validos.has(i)), ...funis.map((f) => f.id).filter((i) => !pedidos.includes(i))];

  await prisma.$transaction(ordem.map((fid, position) => prisma.pipeline.update({ where: { id: fid }, data: { position } })));
  return NextResponse.json({ ok: true });
}
