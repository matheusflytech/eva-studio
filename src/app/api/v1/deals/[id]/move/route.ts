import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos, idOpc, textoOpc } from "@/lib/server/api-v1/entrada";
import { ErroApi } from "@/lib/server/api-v1/http";
import { carregarNegocio, moverNegocio, serializarNegocios } from "@/lib/server/api-v1/negocios";

// POST /api/v1/deals/{id}/move — { stage_id, pipeline_id?, lost_reason? }.
export const POST = rotaV1<{ id: string }>({ recurso: "deals" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["stage_id", "pipeline_id", "lost_reason"]);
  const stageId = idOpc(corpo, "stage_id");
  if (!stageId) throw new ErroApi(400, "invalid_parameter", "stage_id é obrigatório.", { param: "stage_id" });
  const r = await moverNegocio(ctx.orgId, id, {
    stageId,
    pipelineId: idOpc(corpo, "pipeline_id"),
    lostReason: textoOpc(corpo, "lost_reason", 500),
  });
  const [data] = await serializarNegocios(ctx.orgId, [await carregarNegocio(ctx.orgId, id)]);
  return NextResponse.json({ data, moved: r.mudou });
});
