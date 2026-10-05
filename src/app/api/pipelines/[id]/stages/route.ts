import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { MAX_ETAPAS, corValida, probabilidade, tipoValido } from "@/lib/server/funis";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const funil = await prisma.pipeline.findFirst({ where: { id, orgId: ctx.orgId }, include: { stages: { orderBy: { position: "asc" } } } });
  if (!funil) return NextResponse.json({ error: "Funil não encontrado." }, { status: 404 });
  if (funil.stages.length >= MAX_ETAPAS) {
    return NextResponse.json({ error: `O limite é de ${MAX_ETAPAS} etapas por funil.` }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 40);
  if (!name) return NextResponse.json({ error: "Dê um nome à etapa." }, { status: 400 });
  const type = tipoValido(body.type);

  // Etapa aberta nasce antes das de fechamento (ganho/perdido ficam no fim).
  const primeiraDeFechamento = funil.stages.find((s) => s.type !== "open");
  const position = type === "open" && primeiraDeFechamento ? primeiraDeFechamento.position : funil.stages.length;

  const etapa = await prisma.$transaction(async (tx) => {
    await tx.pipelineStage.updateMany({ where: { pipelineId: id, position: { gte: position } }, data: { position: { increment: 1 } } });
    return tx.pipelineStage.create({
      data: { pipelineId: id, name, type, position, color: corValida(body.color), probability: probabilidade(body.probability, type) },
    });
  });
  return NextResponse.json({ stage: etapa });
}
