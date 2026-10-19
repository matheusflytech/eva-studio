import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos, textoOpc } from "@/lib/server/api-v1/entrada";
import { carregarNegocio, fecharNegocio, serializarNegocios } from "@/lib/server/api-v1/negocios";

// POST /api/v1/deals/{id}/lost — { lost_reason? }. Etapa de perda do funil do negócio.
export const POST = rotaV1<{ id: string }>({ recurso: "deals" }, async (ctx, { id }) => {
  const corpo = ctx.corpoBruto.trim() ? ctx.corpo() : {};
  conferirCampos(corpo, ["lost_reason"]);
  const r = await fecharNegocio(ctx.orgId, id, "lost", textoOpc(corpo, "lost_reason", 500) ?? "");
  const [data] = await serializarNegocios(ctx.orgId, [await carregarNegocio(ctx.orgId, id)]);
  return NextResponse.json({ data, moved: r.mudou });
});
