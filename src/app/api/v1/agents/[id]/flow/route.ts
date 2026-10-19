import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { carregarAgente, serializarFluxo, substituirFluxo, validarFluxo } from "@/lib/server/api-v1/fluxos";

type P = { id: string };

// GET /api/v1/agents/{id}/flow — o canvas do Builder (nodes/edges do React Flow).
export const GET = rotaV1<P>({ recurso: "flows" }, async (ctx, { id }) => {
  await carregarAgente(ctx.orgId, id);
  return NextResponse.json({ data: serializarFluxo(id, await prisma.agentFlow.findUnique({ where: { agentId: id } })) });
});

// PUT /api/v1/agents/{id}/flow — { nodes, edges } substitui o fluxo inteiro,
// só se passar na validação (422 invalid_flow com details.issues). A versão
// anterior fica guardada: POST /flow/restore desfaz.
export const PUT = rotaV1<P>({ recurso: "flows" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["nodes", "edges"]);
  await carregarAgente(ctx.orgId, id);
  const fluxo = await validarFluxo(ctx.orgId, corpo);
  const salvo = await substituirFluxo(ctx.orgId, id, fluxo);
  return NextResponse.json({ data: serializarFluxo(id, salvo) });
});
