import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { carregarAgente } from "@/lib/server/api-v1/fluxos";
import { criarSubfluxo, serializarSubfluxo } from "@/lib/server/subfluxos";

type P = { id: string };

// GET /api/v1/agents/{id}/subflows — os fluxos extras do bot ("Vendas",
// "Suporte"...), na ordem das abas. O principal é /agents/{id}/flow.
export const GET = rotaV1<P>({ recurso: "flows" }, async (ctx, { id }) => {
  lerConsulta(ctx.url);
  await carregarAgente(ctx.orgId, id);
  const flows = await prisma.agentSubflow.findMany({ where: { agentId: id }, orderBy: [{ position: "asc" }, { createdAt: "asc" }] });
  return NextResponse.json({ data: flows.map(serializarSubfluxo), has_more: false, next_cursor: null });
});

// POST /api/v1/agents/{id}/subflows — { name, keywords?, nodes?, edges? }.
// Sem nodes/edges o fluxo nasce só com o bloco Início.
export const POST = rotaV1<P>({ recurso: "flows" }, async (ctx, { id }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["name", "keywords", "nodes", "edges"]);
  const agente = await carregarAgente(ctx.orgId, id);
  const { flow, avisos } = await criarSubfluxo(ctx.orgId, id, corpo, { modo: "api", temUrlDoFluxo: !!agente.outboundUrl?.trim() });
  return NextResponse.json({ data: serializarSubfluxo(flow), warnings: avisos }, { status: 201 });
});
