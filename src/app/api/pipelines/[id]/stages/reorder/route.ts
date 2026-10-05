import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const etapas = await prisma.pipelineStage.findMany({
    where: { pipelineId: id, pipeline: { orgId: ctx.orgId } },
    select: { id: true },
    orderBy: { position: "asc" },
  });
  if (etapas.length === 0) return NextResponse.json({ error: "Funil não encontrado." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const pedidas: string[] = Array.isArray(body.ids) ? body.ids.map(String) : [];
  const validas = new Set(etapas.map((e) => e.id));
  // Etapas que o cliente não mandou ficam no fim, na ordem atual: assim uma
  // lista desatualizada nunca apaga nem duplica posições.
  const ordem = [...pedidas.filter((i) => validas.has(i)), ...etapas.map((e) => e.id).filter((i) => !pedidas.includes(i))];

  await prisma.$transaction(ordem.map((sid, position) => prisma.pipelineStage.update({ where: { id: sid }, data: { position } })));
  return NextResponse.json({ ok: true });
}
