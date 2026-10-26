import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { ErroApi, segmento } from "@/lib/server/api-v1/http";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { idPorExterno } from "@/lib/server/api-v1/externos";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";
import {
  CAMPOS_DE_NEGOCIO,
  CAMPOS_DE_PATCH_DE_NEGOCIO,
  carregarNegocio,
  lerDadosDeNegocio,
  serializarNegocios,
  upsertNegocio,
} from "@/lib/server/api-v1/negocios";

type P = { externalId: string };

export const GET = rotaV1<P>({ recurso: "deals" }, async (ctx, { externalId }) => {
  const sp = lerConsulta(ctx.url, ["external_source"]);
  const source = sp.get("external_source") || "api";
  const id = await idPorExterno(ctx.orgId, "deal", segmento(externalId), source);
  if (!id) throw new ErroApi(404, "not_found", "Nenhum negócio com esse external_id.");
  const [data] = await serializarNegocios(ctx.orgId, [await carregarNegocio(ctx.orgId, id)], source);
  return NextResponse.json({ data });
});

// PUT /api/v1/deals/by-external-id/{externalId} — cria (com os campos de
// criação) ou atualiza (PATCH parcial; contatos só acrescentam).
export const PUT = rotaV1<P>({ recurso: "deals" }, async (ctx, { externalId }) => {
  const corpo = ctx.corpo();
  const permitidos = [...new Set([...CAMPOS_DE_NEGOCIO, ...CAMPOS_DE_PATCH_DE_NEGOCIO, "contact_id", "contact_ids"])];
  conferirCampos(
    corpo,
    permitidos.filter((c) => c !== "external_id")
  );
  const id = segmento(externalId).slice(0, 255);
  if (!id) throw new ErroApi(400, "invalid_parameter", "external_id vazio.", { param: "external_id" });
  const dados = await lerDadosDeNegocio(ctx.orgId, corpo);
  dados.externalId = id;
  const r = await upsertNegocio(ctx.orgId, dados);
  const [data] = await serializarNegocios(ctx.orgId, [await carregarNegocio(ctx.orgId, r.id)], dados.source);
  return NextResponse.json({ data, result: r.result, matched_by: r.matchedBy }, { status: r.result === "created" ? 201 : 200 });
});
