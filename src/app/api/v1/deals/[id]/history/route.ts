import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { corpoDeLista } from "@/lib/server/api-v1/http";
import { lerConsulta, paginar } from "@/lib/server/api-v1/paginacao";
import { carregarNegocio } from "@/lib/server/api-v1/negocios";
import { numerosDeEtapas, numerosDeFunis } from "@/lib/server/api-v1/funis";

// GET /api/v1/deals/{id}/history — cada entrada em etapa (DealStageEvent), da mais antiga para a mais nova.
export const GET = rotaV1<{ id: string }>({ recurso: "deals" }, async (ctx, { id }) => {
  const sp = lerConsulta(ctx.url);
  await carregarNegocio(ctx.orgId, id);
  const where = { dealId: id, orgId: ctx.orgId };
  const pagina = await paginar({
    sp,
    campo: "at",
    buscar: ({ cursor, take, orderBy }) =>
      // Select explícito: tolera o banco sem a coluna `ignorouObrigatorios`.
      prisma.dealStageEvent.findMany({
        where: cursor ? { AND: [where, cursor] } : where,
        take,
        orderBy,
        select: { id: true, pipelineId: true, fromStageId: true, toStageId: true, origem: true, at: true },
      }),
    contar: () => prisma.dealStageEvent.count({ where }),
  });
  // Funil e etapa pelo número do contrato; apagado depois sai null.
  const funis = await numerosDeFunis(pagina.itens.map((e) => e.pipelineId));
  const etapas = await numerosDeEtapas(pagina.itens.flatMap((e) => [e.fromStageId, e.toStageId]));
  return NextResponse.json(
    corpoDeLista(
      pagina.itens.map((e) => ({
        id: e.id,
        pipeline_id: funis.get(e.pipelineId) ?? null,
        from_stage_id: e.fromStageId ? etapas.get(e.fromStageId) ?? null : null,
        to_stage_id: etapas.get(e.toStageId) ?? null,
        source: e.origem,
        at: e.at.toISOString(),
      })),
      pagina
    )
  );
});
