import { NextResponse } from "next/server";
import { reordenarEtapas } from "@/lib/server/funis-acoes";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { lerIds } from "@/lib/server/api-v1/funis";

// POST /api/v1/pipelines/{id}/stages/reorder — { ids: [...] }.
export const POST = rotaV1<{ id: string }>({ recurso: "pipelines" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["ids"]);
  const ordem = await reordenarEtapas(ctx.orgId, id, lerIds(corpo));
  return NextResponse.json({ data: { ids: ordem } });
});
