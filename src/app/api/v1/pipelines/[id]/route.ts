import { NextResponse } from "next/server";
import { apagarFunil, atualizarFunil } from "@/lib/server/funis-acoes";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";
import { carregarFunil, serializarFunil } from "@/lib/server/api-v1/funis";

type P = { id: string };

export const GET = rotaV1<P>({ recurso: "pipelines" }, async (ctx, { id }) => {
  return NextResponse.json({ data: serializarFunil(await carregarFunil(ctx.orgId, id)) });
});

// PATCH { name?, is_default? }
export const PATCH = rotaV1<P>({ recurso: "pipelines" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["name", "is_default"]);
  await atualizarFunil(ctx.orgId, id, { name: corpo.name, isDefault: corpo.is_default });
  return NextResponse.json({ data: serializarFunil(await carregarFunil(ctx.orgId, id)) });
});

// DELETE ?move_to=<pipelineId> — obrigatório quando o funil tem negócios
// (409 move_to_required). Os negócios caem na etapa equivalente do destino.
export const DELETE = rotaV1<P>({ recurso: "pipelines" }, async (ctx, { id }) => {
  const sp = lerConsulta(ctx.url, ["move_to"]);
  const r = await apagarFunil(ctx.orgId, id, sp.get("move_to"));
  return NextResponse.json({ data: { id, deleted: true, moved_deals: r.movidos } });
});
