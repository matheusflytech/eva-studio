import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { carregarNegocio, fecharNegocio, serializarNegocios } from "@/lib/server/api-v1/negocios";

// POST /api/v1/deals/{id}/won — move para a etapa de ganho do funil do negócio.
export const POST = rotaV1<{ id: string }>({ recurso: "deals" }, async (ctx, { id }) => {
  if (ctx.corpoBruto.trim()) conferirCampos(ctx.corpo(), []);
  const r = await fecharNegocio(ctx.orgId, id, "won");
  const [data] = await serializarNegocios(ctx.orgId, [await carregarNegocio(ctx.orgId, id)]);
  return NextResponse.json({ data, moved: r.mudou });
});
