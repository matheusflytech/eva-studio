import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { corpoDeLista } from "@/lib/server/api-v1/http";
import { lerConsulta, paginar } from "@/lib/server/api-v1/paginacao";
import { carregarContato } from "@/lib/server/api-v1/contatos";
import { INCLUDE_NEGOCIO, serializarNegocios } from "@/lib/server/api-v1/negocios";

// GET /api/v1/contacts/{id}/deals — os negócios do contato (a lacuna do Beeno).
export const GET = rotaV1<{ id: string }>({ recurso: "deals" }, async (ctx, { id }) => {
  const sp = lerConsulta(ctx.url);
  await carregarContato(ctx.orgId, id);
  const where = { orgId: ctx.orgId, contacts: { some: { contactId: id } } };
  const pagina = await paginar({
    sp,
    campo: "updatedAt",
    buscar: ({ cursor, take, orderBy }) =>
      prisma.deal.findMany({ where: cursor ? { AND: [where, cursor] } : where, include: INCLUDE_NEGOCIO, take, orderBy }),
  });
  return NextResponse.json(corpoDeLista(await serializarNegocios(ctx.orgId, pagina.itens), pagina));
});
