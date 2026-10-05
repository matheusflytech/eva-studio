import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { corValida, probabilidade, tipoValido } from "@/lib/server/funis";

function carregar(id: string, stageId: string, orgId: string) {
  return prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId: id, pipeline: { orgId } } });
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string; stageId: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id, stageId } = await params;

  const etapa = await carregar(id, stageId, ctx.orgId);
  if (!etapa) return NextResponse.json({ error: "Etapa não encontrada." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const data: { name?: string; color?: string; type?: string; probability?: number } = {};
  if (body.name !== undefined) {
    const name = String(body.name).trim().slice(0, 40);
    if (!name) return NextResponse.json({ error: "O nome não pode ficar vazio." }, { status: 400 });
    data.name = name;
  }
  if (body.color !== undefined) data.color = corValida(body.color);
  const tipo = body.type !== undefined ? tipoValido(body.type) : etapa.type;
  if (body.type !== undefined) data.type = tipo;
  if (body.probability !== undefined || body.type !== undefined) {
    data.probability = probabilidade(body.probability ?? etapa.probability, tipo);
  }

  await prisma.$transaction(async (tx) => {
    await tx.pipelineStage.update({ where: { id: stageId }, data });

    // Mudar o tipo da etapa muda o que os negócios nela significam: ganho e
    // perdido carimbam a data de fechamento, aberto limpa.
    if (data.type && data.type !== etapa.type) {
      const fechando = data.type !== "open";
      await tx.deal.updateMany({
        where: { stageId, closedAt: fechando ? null : { not: null } },
        data: { closedAt: fechando ? new Date() : null },
      });
      if (data.type !== "lost") await tx.deal.updateMany({ where: { stageId }, data: { lostReason: "" } });
    }
    // Probabilidade nova vale pros negócios que ainda usavam a antiga; quem
    // foi ajustado à mão continua com o valor dele.
    if (data.probability !== undefined && data.probability !== etapa.probability) {
      await tx.deal.updateMany({ where: { stageId, probability: etapa.probability }, data: { probability: data.probability } });
    }
  });
  return NextResponse.json({ ok: true });
}

// Apagar etapa com negócios exige ?moverPara=etapaId (do mesmo funil).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; stageId: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id, stageId } = await params;

  const etapa = await carregar(id, stageId, ctx.orgId);
  if (!etapa) return NextResponse.json({ error: "Etapa não encontrada." }, { status: 404 });

  const irmas = await prisma.pipelineStage.findMany({ where: { pipelineId: id }, orderBy: { position: "asc" } });
  if (irmas.length <= 1) return NextResponse.json({ error: "O funil precisa de pelo menos uma etapa." }, { status: 400 });

  const qtd = await prisma.deal.count({ where: { stageId } });
  const moverPara = new URL(request.url).searchParams.get("moverPara");
  let destino: (typeof irmas)[number] | null = null;
  if (qtd > 0) {
    destino = irmas.find((s) => s.id === moverPara && s.id !== stageId) ?? null;
    if (!destino) return NextResponse.json({ error: `Esta etapa tem ${qtd} negócio(s). Escolha para qual etapa eles vão.`, deals: qtd }, { status: 409 });
  }

  await prisma.$transaction(async (tx) => {
    if (destino) {
      await tx.deal.updateMany({
        where: { stageId },
        data: { stageId: destino.id, probability: destino.probability, stageSince: new Date(), closedAt: destino.type === "open" ? null : new Date() },
      });
    }
    await tx.pipelineStage.delete({ where: { id: stageId } });
    const restantes = irmas.filter((s) => s.id !== stageId);
    for (let i = 0; i < restantes.length; i++) {
      await tx.pipelineStage.update({ where: { id: restantes[i].id }, data: { position: i } });
    }
  });
  return NextResponse.json({ ok: true, movidos: qtd });
}
