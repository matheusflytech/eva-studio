import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";

// GET /api/v1/agents — agentes da organização (para achar o id do fluxo e da sequência).
export const GET = rotaV1({ recurso: "flows" }, async (ctx) => {
  lerConsulta(ctx.url);
  const agentes = await prisma.agent.findMany({
    where: { orgId: ctx.orgId },
    select: { id: true, name: true, status: true, primaryChannel: true, createdAt: true, updatedAt: true },
    orderBy: { createdAt: "asc" },
    take: 500,
  });
  return NextResponse.json({
    data: agentes.map((a) => ({
      id: a.id,
      name: a.name,
      status: a.status,
      primary_channel: a.primaryChannel,
      created_at: a.createdAt.toISOString(),
      updated_at: a.updatedAt.toISOString(),
    })),
    has_more: false,
    next_cursor: null,
  });
});
