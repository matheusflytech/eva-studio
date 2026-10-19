import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { corpoDeLista } from "@/lib/server/api-v1/http";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { lerConsulta, paginar } from "@/lib/server/api-v1/paginacao";
import {
  CAMPOS_DE_EMPRESA,
  FILTROS_DE_EMPRESA,
  carregarEmpresa,
  criarEmpresa,
  lerDadosDeEmpresa,
  serializarEmpresa,
  serializarEmpresas,
  whereDeEmpresas,
} from "@/lib/server/api-v1/empresas";

export const GET = rotaV1({ recurso: "companies" }, async (ctx) => {
  const sp = lerConsulta(ctx.url, FILTROS_DE_EMPRESA);
  const where = await whereDeEmpresas(ctx.orgId, sp);
  const pagina = await paginar({
    sp,
    campo: "updatedAt",
    buscar: ({ cursor, take, orderBy }) => prisma.company.findMany({ where: cursor ? { AND: [where, cursor] } : where, take, orderBy }),
    contar: () => prisma.company.count({ where }),
  });
  return NextResponse.json(corpoDeLista(await serializarEmpresas(ctx.orgId, pagina.itens), pagina));
});

// POST /api/v1/companies — CNPJ ou external_id já usados: 409 `duplicate`.
export const POST = rotaV1({ recurso: "companies" }, async (ctx) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, CAMPOS_DE_EMPRESA);
  const dados = await lerDadosDeEmpresa(ctx.orgId, corpo);
  const { id } = await criarEmpresa(ctx.orgId, dados);
  return NextResponse.json({ data: serializarEmpresa(await carregarEmpresa(ctx.orgId, id), dados.externalId ?? null) }, { status: 201 });
});
