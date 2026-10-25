import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { boolOpc, conferirCampos, textoOpc } from "@/lib/server/api-v1/entrada";
import { ErroApi } from "@/lib/server/api-v1/http";
import { carregarNegocio, moverNegocio, serializarNegocios } from "@/lib/server/api-v1/negocios";
import { refOpc, uuidDaEtapa, uuidDoFunil } from "@/lib/server/api-v1/funis";

// POST /api/v1/deals/{id}/move — { stage_id, pipeline_id? (números do contrato), lost_reason?, lost_reason_id?, lost_note?, reopen? }.
// Mesmas regras da tela: negócio ganho/perdido só sai com reopen: true; faltou
// campo obrigatório da etapa → 422 stage_requirements_missing com a lista.
export const POST = rotaV1<{ id: string }>({ recurso: "deals" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["stage_id", "pipeline_id", "lost_reason", "lost_reason_id", "lost_note", "reopen"]);
  if (corpo.stage_id === undefined || corpo.stage_id === null || corpo.stage_id === "") {
    throw new ErroApi(400, "invalid_parameter", "stage_id é obrigatório.", { param: "stage_id" });
  }
  const stageId = await uuidDaEtapa(ctx.orgId, corpo.stage_id, "stage_id");
  const r = await moverNegocio(ctx.orgId, id, {
    stageId,
    pipelineId: await refOpc(corpo.pipeline_id, (v) => uuidDoFunil(ctx.orgId, v, "pipeline_id")),
    lostReason: textoOpc(corpo, "lost_reason", 500),
    lostReasonId: textoOpc(corpo, "lost_reason_id", 80),
    lostNote: textoOpc(corpo, "lost_note", 500),
    reopen: boolOpc(corpo, "reopen") === true,
  });
  const [data] = await serializarNegocios(ctx.orgId, [await carregarNegocio(ctx.orgId, id)]);
  return NextResponse.json({ data, moved: r.mudou });
});
