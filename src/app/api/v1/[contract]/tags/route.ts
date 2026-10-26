import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";

// GET /api/v1/tags — etiquetas da organização (para tag_ids e gatilho de sequência).
export const GET = rotaV1({ recurso: "tags" }, async (ctx) => {
  lerConsulta(ctx.url);
  const tags = await prisma.tag.findMany({ where: { orgId: ctx.orgId }, orderBy: { name: "asc" }, take: 1000 });
  return NextResponse.json({
    data: tags.map((t) => ({ id: t.id, name: t.name, color: t.color, created_at: t.createdAt.toISOString() })),
    has_more: false,
    next_cursor: null,
  });
});
