import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { apagarPelaApi } from "@/lib/server/api-v1/lixeira";
import {
  CAMPOS_DE_PATCH_DE_NEGOCIO,
  atualizarNegocio,
  carregarNegocio,
  lerDadosDeNegocio,
  serializarNegocios,
} from "@/lib/server/api-v1/negocios";

type P = { id: string };

export const GET = rotaV1<P>({ recurso: "deals" }, async (ctx, { id }) => {
  const [data] = await serializarNegocios(ctx.orgId, [await carregarNegocio(ctx.orgId, id)]);
  return NextResponse.json({ data });
});

// PATCH parcial. stage_id move de etapa (histórico com origem "api"); etapa de
// outro funil só com pipeline_id do funil da etapa.
export const PATCH = rotaV1<P>({ recurso: "deals" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, CAMPOS_DE_PATCH_DE_NEGOCIO);
  await carregarNegocio(ctx.orgId, id);
  const dados = await lerDadosDeNegocio(ctx.orgId, corpo);
  await atualizarNegocio(ctx.orgId, id, dados);
  const [data] = await serializarNegocios(ctx.orgId, [await carregarNegocio(ctx.orgId, id)], dados.source);
  return NextResponse.json({ data });
});

export const DELETE = rotaV1<P>({ recurso: "deals" }, async (ctx, { id }) => {
  await carregarNegocio(ctx.orgId, id);
  return apagarPelaApi(ctx.orgId, "deal", id, "API");
});
