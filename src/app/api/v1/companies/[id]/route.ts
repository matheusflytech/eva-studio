import { NextResponse } from "next/server";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { apagarPelaApi } from "@/lib/server/api-v1/lixeira";
import {
  CAMPOS_DE_EMPRESA,
  atualizarEmpresa,
  carregarEmpresa,
  lerDadosDeEmpresa,
  serializarEmpresas,
} from "@/lib/server/api-v1/empresas";

type P = { id: string };

export const GET = rotaV1<P>({ recurso: "companies" }, async (ctx, { id }) => {
  lerConsulta(ctx.url);
  const [data] = await serializarEmpresas(ctx.orgId, [await carregarEmpresa(ctx.orgId, id)]);
  return NextResponse.json({ data });
});

export const PATCH = rotaV1<P>({ recurso: "companies" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, CAMPOS_DE_EMPRESA);
  await carregarEmpresa(ctx.orgId, id);
  const dados = await lerDadosDeEmpresa(ctx.orgId, corpo);
  await atualizarEmpresa(ctx.orgId, id, dados);
  const [data] = await serializarEmpresas(ctx.orgId, [await carregarEmpresa(ctx.orgId, id)], dados.source);
  return NextResponse.json({ data });
});

// Contatos e negócios da empresa ficam (a relação é SetNull), como na tela.
export const DELETE = rotaV1<P>({ recurso: "companies" }, async (ctx, { id }) => {
  await carregarEmpresa(ctx.orgId, id);
  return apagarPelaApi(ctx.orgId, "company", id, "API");
});
