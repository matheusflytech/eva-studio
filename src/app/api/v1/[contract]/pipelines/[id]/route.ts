import { NextResponse } from "next/server";
import { apagarFunil, atualizarFunil } from "@/lib/server/funis-acoes";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { ErroApi } from "@/lib/server/api-v1/http";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";
import { carregarFunil, funilDoCaminho, serializarFunil, uuidDoFunil } from "@/lib/server/api-v1/funis";

type P = { id: string };

export const GET = rotaV1<P>({ recurso: "pipelines" }, async (ctx, { id }) => {
  const funil = await funilDoCaminho(ctx.orgId, id);
  return NextResponse.json({ data: serializarFunil(await carregarFunil(ctx.orgId, funil.id)) });
});

// PATCH { name?, is_default? }
export const PATCH = rotaV1<P>({ recurso: "pipelines" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["name", "is_default"]);
  const funil = await funilDoCaminho(ctx.orgId, id);
  await atualizarFunil(ctx.orgId, funil.id, { name: corpo.name, isDefault: corpo.is_default });
  return NextResponse.json({ data: serializarFunil(await carregarFunil(ctx.orgId, funil.id)) });
});

// DELETE ?move_to=<número do funil> — obrigatório quando o funil tem negócios
// (409 move_to_required). Os negócios caem na etapa equivalente do destino.
export const DELETE = rotaV1<P>({ recurso: "pipelines" }, async (ctx, { id }) => {
  const sp = lerConsulta(ctx.url, ["move_to"]);
  const funil = await funilDoCaminho(ctx.orgId, id);
  const moverPara = sp.get("move_to") ? await uuidDoFunil(ctx.orgId, sp.get("move_to"), "move_to") : null;
  if (moverPara === funil.id) throw new ErroApi(400, "invalid_move_to", "move_to precisa ser outro funil.", { param: "move_to" });
  const r = await apagarFunil(ctx.orgId, funil.id, moverPara);
  return NextResponse.json({ data: { id: funil.numero, deleted: true, moved_deals: r.movidos } });
});
