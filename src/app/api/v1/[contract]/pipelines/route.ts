import { NextResponse } from "next/server";
import { criarFunil, listarFunis } from "@/lib/server/funis-acoes";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";
import { carregarFunil, serializarFunil } from "@/lib/server/api-v1/funis";

// GET /api/v1/pipelines — todos os funis com as etapas (são poucos: até 15).
export const GET = rotaV1({ recurso: "pipelines" }, async (ctx) => {
  lerConsulta(ctx.url);
  const funis = await listarFunis(ctx.orgId);
  return NextResponse.json({ data: funis.map(serializarFunil), has_more: false, next_cursor: null });
});

// POST /api/v1/pipelines — { name, stages: [{ name, type?, probability?, color? }] }.
// Mesmos limites da tela: 15 funis, 20 etapas por funil.
export const POST = rotaV1({ recurso: "pipelines" }, async (ctx) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["name", "stages"]);
  const criado = await criarFunil(ctx.orgId, { name: corpo.name, stages: corpo.stages });
  return NextResponse.json({ data: serializarFunil(await carregarFunil(ctx.orgId, criado.id)) }, { status: 201 });
});
