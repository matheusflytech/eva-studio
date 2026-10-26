import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { corpoDeLista } from "@/lib/server/api-v1/http";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { lerConsulta, paginar } from "@/lib/server/api-v1/paginacao";
import {
  CAMPOS_DE_NEGOCIO,
  FILTROS_DE_NEGOCIO,
  INCLUDE_NEGOCIO,
  carregarNegocio,
  lerDadosDeNegocio,
  serializarNegocios,
  upsertNegocio,
  whereDeNegocios,
} from "@/lib/server/api-v1/negocios";

// GET /api/v1/deals — por cursor, em ordem de atualização. Filtros:
// updated_since, pipeline, stage, owner, company, contact, status, external_id, archived.
export const GET = rotaV1({ recurso: "deals" }, async (ctx) => {
  const sp = lerConsulta(ctx.url, FILTROS_DE_NEGOCIO);
  const where = await whereDeNegocios(ctx.orgId, sp);
  const pagina = await paginar({
    sp,
    campo: "updatedAt",
    buscar: ({ cursor, take, orderBy }) =>
      prisma.deal.findMany({ where: cursor ? { AND: [where, cursor] } : where, include: INCLUDE_NEGOCIO, take, orderBy }),
    contar: () => prisma.deal.count({ where }),
  });
  return NextResponse.json(corpoDeLista(await serializarNegocios(ctx.orgId, pagina.itens, sp.get("external_source") || undefined), pagina));
});

// POST /api/v1/deals — cria. Com external_id já usado: 409 `duplicate`
// (para atualizar, PUT /deals/by-external-id/{id}).
export const POST = rotaV1({ recurso: "deals" }, async (ctx) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, CAMPOS_DE_NEGOCIO);
  const dados = await lerDadosDeNegocio(ctx.orgId, corpo);
  const r = await upsertNegocio(ctx.orgId, dados, { modo: "create" });
  const [data] = await serializarNegocios(ctx.orgId, [await carregarNegocio(ctx.orgId, r.id)], dados.source);
  return NextResponse.json({ data }, { status: 201 });
});
