import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { apagarEtapa, atualizarEtapa } from "@/lib/server/funis-acoes";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";
import { etapaDoCaminho, funilDoCaminho, lerNumero, serializarEtapa, uuidDaEtapa } from "@/lib/server/api-v1/funis";

type P = { id: string; stageId: string };

// PATCH { name?, type?, probability?, color? } — mudar o tipo carimba/limpa
// o fechamento dos negócios da etapa, como na tela.
export const PATCH = rotaV1<P>({ recurso: "pipelines" }, async (ctx, { id, stageId }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["name", "type", "probability", "color"]);
  const funil = await funilDoCaminho(ctx.orgId, id);
  const etapaId = await etapaDoCaminho(ctx.orgId, funil.id, stageId);
  await atualizarEtapa(ctx.orgId, funil.id, etapaId, corpo);
  const etapa = await prisma.pipelineStage.findFirst({ where: { id: etapaId, pipelineId: funil.id } });
  return NextResponse.json({ data: etapa ? serializarEtapa(etapa, funil.numero) : null });
});

// DELETE ?move_to=<número da etapa do mesmo funil> — obrigatório com negócios (409 move_to_required).
export const DELETE = rotaV1<P>({ recurso: "pipelines" }, async (ctx, { id, stageId }) => {
  const sp = lerConsulta(ctx.url, ["move_to"]);
  const funil = await funilDoCaminho(ctx.orgId, id);
  const etapaId = await etapaDoCaminho(ctx.orgId, funil.id, stageId);
  const moverPara = sp.get("move_to") ? await uuidDaEtapa(ctx.orgId, sp.get("move_to"), "move_to") : null;
  const r = await apagarEtapa(ctx.orgId, funil.id, etapaId, moverPara);
  return NextResponse.json({ data: { id: lerNumero(stageId, "stageId"), deleted: true, moved_deals: r.movidos } });
});
