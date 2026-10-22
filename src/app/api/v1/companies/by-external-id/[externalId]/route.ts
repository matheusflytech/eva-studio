import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { ErroApi, segmento } from "@/lib/server/api-v1/http";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { idPorExterno } from "@/lib/server/api-v1/externos";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";
import { CAMPOS_DE_EMPRESA, carregarEmpresa, lerDadosDeEmpresa, serializarEmpresas, upsertEmpresa } from "@/lib/server/api-v1/empresas";

type P = { externalId: string };

export const GET = rotaV1<P>({ recurso: "companies" }, async (ctx, { externalId }) => {
  const sp = lerConsulta(ctx.url, ["external_source"]);
  const id = await idPorExterno(ctx.orgId, "company", segmento(externalId), sp.get("external_source") || "api");
  if (!id) throw new ErroApi(404, "not_found", "Nenhuma empresa com esse external_id.");
  const [data] = await serializarEmpresas(ctx.orgId, [await carregarEmpresa(ctx.orgId, id)]);
  return NextResponse.json({ data });
});

// PUT /api/v1/companies/by-external-id/{externalId} — upsert; sem vínculo, o CNPJ é a reserva.
export const PUT = rotaV1<P>({ recurso: "companies" }, async (ctx, { externalId }) => {
  const corpo = ctx.corpo();
  conferirCampos(
    corpo,
    CAMPOS_DE_EMPRESA.filter((c) => c !== "external_id")
  );
  const id = segmento(externalId).slice(0, 255);
  if (!id) throw new ErroApi(400, "invalid_parameter", "external_id vazio.", { param: "external_id" });
  const dados = await lerDadosDeEmpresa(ctx.orgId, corpo);
  dados.externalId = id;
  const r = await upsertEmpresa(ctx.orgId, dados);
  const [data] = await serializarEmpresas(ctx.orgId, [await carregarEmpresa(ctx.orgId, r.id)]);
  return NextResponse.json({ data, result: r.result, matched_by: r.matchedBy }, { status: r.result === "created" ? 201 : 200 });
});
