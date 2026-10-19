import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apagarEtapa, atualizarEtapa } from "@/lib/server/funis-acoes";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";
import { serializarEtapa } from "@/lib/server/api-v1/funis";

type P = { id: string; stageId: string };

// PATCH { name?, type?, probability?, color? } — mudar o tipo carimba/limpa
// o fechamento dos negócios da etapa, como na tela.
export const PATCH = rotaV1<P>({ recurso: "pipelines" }, async (ctx, { id, stageId }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["name", "type", "probability", "color"]);
  await atualizarEtapa(ctx.orgId, id, stageId, corpo);
  const etapa = await prisma.pipelineStage.findFirst({ where: { id: stageId, pipelineId: id } });
  return NextResponse.json({ data: etapa ? serializarEtapa(etapa) : null });
});

// DELETE ?move_to=<stageId do mesmo funil> — obrigatório com negócios (409 move_to_required).
export const DELETE = rotaV1<P>({ recurso: "pipelines" }, async (ctx, { id, stageId }) => {
  const sp = lerConsulta(ctx.url, ["move_to"]);
  const r = await apagarEtapa(ctx.orgId, id, stageId, sp.get("move_to"));
  return NextResponse.json({ data: { id: stageId, deleted: true, moved_deals: r.movidos } });
});
