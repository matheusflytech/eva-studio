import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos, textoOpc } from "@/lib/server/api-v1/entrada";
import { carregarNegocio, fecharNegocio, serializarNegocios } from "@/lib/server/api-v1/negocios";

// POST /api/v1/deals/{id}/lost — { lost_reason_id? | lost_reason?, lost_note? }. Etapa de perda do funil do negócio.
// Motivo obrigatório (422 lost_reason_required): lost_reason_id de um motivo do
// funil, ou lost_reason em texto (casa com o rótulo; senão vira "Outro" com a nota).
export const POST = rotaV1<{ id: string }>({ recurso: "deals" }, async (ctx, { id }) => {
  const corpo = ctx.corpoBruto.trim() ? ctx.corpo() : {};
  conferirCampos(corpo, ["lost_reason", "lost_reason_id", "lost_note"]);
  const r = await fecharNegocio(ctx.orgId, id, "lost", {
    lostReason: textoOpc(corpo, "lost_reason", 500),
    lostReasonId: textoOpc(corpo, "lost_reason_id", 80),
    lostNote: textoOpc(corpo, "lost_note", 500),
  });
  const [data] = await serializarNegocios(ctx.orgId, [await carregarNegocio(ctx.orgId, id)]);
  return NextResponse.json({ data, moved: r.mudou });
});
