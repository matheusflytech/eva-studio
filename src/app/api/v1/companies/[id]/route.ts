import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { registrarExclusao } from "@/lib/server/api-v1/externos";
import {
  CAMPOS_DE_EMPRESA,
  atualizarEmpresa,
  carregarEmpresa,
  lerDadosDeEmpresa,
  serializarEmpresas,
} from "@/lib/server/api-v1/empresas";

type P = { id: string };

export const GET = rotaV1<P>({ recurso: "companies" }, async (ctx, { id }) => {
  const [data] = await serializarEmpresas(ctx.orgId, [await carregarEmpresa(ctx.orgId, id)]);
  return NextResponse.json({ data });
});

export const PATCH = rotaV1<P>({ recurso: "companies" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, CAMPOS_DE_EMPRESA);
  await carregarEmpresa(ctx.orgId, id);
  await atualizarEmpresa(ctx.orgId, id, await lerDadosDeEmpresa(ctx.orgId, corpo));
  const [data] = await serializarEmpresas(ctx.orgId, [await carregarEmpresa(ctx.orgId, id)]);
  return NextResponse.json({ data });
});

// Contatos e negócios da empresa ficam (a relação é SetNull), como na tela.
export const DELETE = rotaV1<P>({ recurso: "companies" }, async (ctx, { id }) => {
  await carregarEmpresa(ctx.orgId, id);
  await registrarExclusao(ctx.orgId, "company", id);
  await prisma.company.delete({ where: { id } });
  return NextResponse.json({ data: { id, deleted: true } });
});
