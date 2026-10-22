import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { corpoDeLista } from "@/lib/server/api-v1/http";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { lerConsulta, paginar } from "@/lib/server/api-v1/paginacao";
import { CAMPOS_DE_SEQUENCIA, INCLUDE_SEQUENCIA, criarSequencia, serializarSequencia } from "@/lib/server/api-v1/sequencias";

// GET /api/v1/sequences?agent=<id> — réguas da organização.
export const GET = rotaV1({ recurso: "sequences" }, async (ctx) => {
  const sp = lerConsulta(ctx.url, ["agent"]);
  const where = { agent: { orgId: ctx.orgId }, ...(sp.get("agent") ? { agentId: sp.get("agent")! } : {}) };
  const pagina = await paginar({
    sp,
    campo: "updatedAt",
    buscar: ({ cursor, take, orderBy }) =>
      prisma.sequence.findMany({ where: cursor ? { AND: [where, cursor] } : where, include: INCLUDE_SEQUENCIA, take, orderBy }),
    contar: () => prisma.sequence.count({ where }),
  });
  return NextResponse.json(corpoDeLista(pagina.itens.map((s) => serializarSequencia(s)), pagina));
});

// POST /api/v1/sequences — { agent_id, name, channel?, trigger?, trigger_*_id?, steps?, active? }.
export const POST = rotaV1({ recurso: "sequences" }, async (ctx) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, CAMPOS_DE_SEQUENCIA);
  return NextResponse.json({ data: serializarSequencia(await criarSequencia(ctx.orgId, corpo)) }, { status: 201 });
});
