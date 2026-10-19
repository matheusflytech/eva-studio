import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requirePermission } from "@/lib/server/permissions";
import { etapaEquivalente, moverNegociosDaEtapa } from "@/lib/server/funis";
import { registrarMudancasEmLote } from "@/lib/server/stage-events";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const funil = await prisma.pipeline.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!funil) return NextResponse.json({ error: "Funil não encontrado." }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  let name: string | undefined;
  if (body.name !== undefined) {
    name = String(body.name).trim().slice(0, 60);
    if (!name) return NextResponse.json({ error: "O nome não pode ficar vazio." }, { status: 400 });
  }

  await prisma.$transaction(async (tx) => {
    if (name) await tx.pipeline.update({ where: { id }, data: { name } });
    // Só um funil é o padrão: é onde cai o negócio criado sem funil definido.
    if (body.isDefault === true && !funil.isDefault) {
      await tx.pipeline.updateMany({ where: { orgId: ctx.orgId }, data: { isDefault: false } });
      await tx.pipeline.update({ where: { id }, data: { isDefault: true } });
    }
  });
  return NextResponse.json({ ok: true });
}

// Apagar um funil com negócios exige dizer pra onde eles vão (?moverPara=funilId).
// Cada negócio cai na etapa de mesmo nome do funil de destino, ou na de mesmo
// tipo (ganho/perdido), ou na primeira etapa aberta.
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requirePermission("agents:manage");
  if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  const { id } = await params;

  const funil = await prisma.pipeline.findFirst({ where: { id, orgId: ctx.orgId } });
  if (!funil) return NextResponse.json({ error: "Funil não encontrado." }, { status: 404 });

  const total = await prisma.pipeline.count({ where: { orgId: ctx.orgId } });
  if (total <= 1) return NextResponse.json({ error: "A conta precisa de pelo menos um funil." }, { status: 400 });

  const moverPara = new URL(request.url).searchParams.get("moverPara");
  let destino: Awaited<ReturnType<typeof carregarDestino>> = null;
  if (moverPara && moverPara !== id) {
    destino = await carregarDestino(moverPara, ctx.orgId);
    if (!destino || destino.stages.length === 0) return NextResponse.json({ error: "Funil de destino inválido." }, { status: 400 });
  }

  // Contar, mover e apagar na mesma transação: negócio criado no funil entre
  // a contagem e o delete iria embora junto (cascade).
  const eventos: { dealId: string; fromStageId: string; toStageId: string }[] = [];
  const r = await prisma.$transaction(async (tx) => {
    const qtd = await tx.deal.count({ where: { pipelineId: id } });
    if (qtd > 0 && !destino) return { qtd, faltaDestino: true };
    if (destino) {
      const etapas = await tx.pipelineStage.findMany({ where: { pipelineId: id } });
      for (const etapa of etapas) {
        const alvo = etapaEquivalente(destino.stages, etapa);
        const ids = await moverNegociosDaEtapa(tx, etapa.id, alvo);
        for (const dealId of ids) eventos.push({ dealId, fromStageId: etapa.id, toStageId: alvo.id });
      }
    }
    await tx.pipeline.delete({ where: { id } });
    if (funil.isDefault) {
      const outro = await tx.pipeline.findFirst({ where: { orgId: ctx.orgId }, orderBy: { position: "asc" } });
      if (outro) await tx.pipeline.update({ where: { id: outro.id }, data: { isDefault: true } });
    }
    return { qtd, faltaDestino: false };
  });
  if (r.faltaDestino) {
    return NextResponse.json({ error: `Este funil tem ${r.qtd} negócio(s). Escolha para qual funil eles vão.`, deals: r.qtd }, { status: 409 });
  }

  if (destino) {
    const pipelineId = destino.id;
    await registrarMudancasEmLote(eventos.map((e) => ({ ...e, orgId: ctx.orgId, pipelineId })));
  }
  return NextResponse.json({ ok: true, movidos: r.qtd });
}

function carregarDestino(id: string, orgId: string) {
  return prisma.pipeline.findFirst({ where: { id, orgId }, include: { stages: { orderBy: { position: "asc" } } } });
}
