import { NextResponse } from "next/server";
import { reordenarFunis } from "@/lib/server/funis-acoes";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { prisma } from "@/lib/db/prisma";
import { lerIds } from "@/lib/server/api-v1/funis";

// POST /api/v1/pipelines/reorder — { ids: [números dos funis] }; os que não vierem ficam no fim.
export const POST = rotaV1({ recurso: "pipelines" }, async (ctx) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["ids"]);
  const pedidos = lerIds(corpo);
  const funis = await prisma.pipeline.findMany({ where: { orgId: ctx.orgId }, select: { id: true, numero: true } });
  const uuid = new Map(funis.map((f) => [f.numero, f.id]));
  const numero = new Map(funis.map((f) => [f.id, f.numero]));
  const ordem = await reordenarFunis(ctx.orgId, pedidos.map((n) => uuid.get(n) ?? ""));
  return NextResponse.json({ data: { ids: ordem.map((i) => numero.get(i)) } });
});
