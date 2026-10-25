import { NextResponse } from "next/server";
import { reordenarEtapas } from "@/lib/server/funis-acoes";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { prisma } from "@/lib/db/prisma";
import { funilDoCaminho, lerIds } from "@/lib/server/api-v1/funis";

// POST /api/v1/pipelines/{id}/stages/reorder — { ids: [números das etapas] }.
export const POST = rotaV1<{ id: string }>({ recurso: "pipelines" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["ids"]);
  const pedidos = lerIds(corpo);
  const funil = await funilDoCaminho(ctx.orgId, id);
  const etapas = await prisma.pipelineStage.findMany({ where: { pipelineId: funil.id }, select: { id: true, numero: true } });
  const uuid = new Map(etapas.map((e) => [e.numero, e.id]));
  const numero = new Map(etapas.map((e) => [e.id, e.numero]));
  const ordem = await reordenarEtapas(ctx.orgId, funil.id, pedidos.map((n) => uuid.get(n) ?? ""));
  return NextResponse.json({ data: { ids: ordem.map((i) => numero.get(i)) } });
});
