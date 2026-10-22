import { NextResponse } from "next/server";
import { reordenarFunis } from "@/lib/server/funis-acoes";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { lerIds } from "@/lib/server/api-v1/funis";

// POST /api/v1/pipelines/reorder — { ids: [...] }; os que não vierem ficam no fim.
export const POST = rotaV1({ recurso: "pipelines" }, async (ctx) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["ids"]);
  const ordem = await reordenarFunis(ctx.orgId, lerIds(corpo));
  return NextResponse.json({ data: { ids: ordem } });
});
