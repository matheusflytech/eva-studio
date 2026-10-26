import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";
import { carregarAgente } from "@/lib/server/api-v1/fluxos";
import { FLOW_VERSION_SOURCE, toPublic } from "@/lib/server/api-v1/public-values";

// GET /api/v1/agents/{id}/flow/versions — versões anteriores (mais nova primeiro, até 50).
export const GET = rotaV1<{ id: string }>({ recurso: "flows" }, async (ctx, { id }) => {
  lerConsulta(ctx.url);
  await carregarAgente(ctx.orgId, id);
  const versoes = await prisma.agentFlowVersion.findMany({
    where: { agentId: id, orgId: ctx.orgId },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({
    data: versoes.map((v) => ({
      id: v.id,
      source: toPublic(FLOW_VERSION_SOURCE, v.origem),
      blocks: Array.isArray(v.nodes) ? v.nodes.length : 0,
      created_at: v.createdAt.toISOString(),
    })),
    has_more: false,
    next_cursor: null,
  });
});
