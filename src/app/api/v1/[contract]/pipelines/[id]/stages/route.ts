import { NextResponse } from "next/server";
import { criarEtapa } from "@/lib/server/funis-acoes";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { funilDoCaminho, serializarEtapa } from "@/lib/server/api-v1/funis";

// POST /api/v1/pipelines/{id}/stages — { name, type?: open|won|lost, probability?, color? }.
// Etapa aberta entra antes das de fechamento.
export const POST = rotaV1<{ id: string }>({ recurso: "pipelines" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["name", "type", "probability", "color"]);
  const funil = await funilDoCaminho(ctx.orgId, id);
  const etapa = await criarEtapa(ctx.orgId, funil.id, corpo);
  return NextResponse.json({ data: serializarEtapa(etapa, funil.numero) }, { status: 201 });
});
