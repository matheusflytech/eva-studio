import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { ErroApi } from "@/lib/server/api-v1/http";
import { lerConsulta } from "@/lib/server/api-v1/paginacao";
import { conferirCampos } from "@/lib/server/api-v1/entrada";
import { carregarAgente } from "@/lib/server/api-v1/fluxos";
import { apagarSubfluxo, atualizarSubfluxo, serializarSubfluxo } from "@/lib/server/subfluxos";

type P = { id: string; flowId: string };

export const GET = rotaV1<P>({ recurso: "flows" }, async (ctx, { id, flowId }) => {
  lerConsulta(ctx.url);
  await carregarAgente(ctx.orgId, id);
  const flow = await prisma.agentSubflow.findFirst({ where: { id: flowId, agentId: id } });
  if (!flow) throw new ErroApi(404, "not_found", "Fluxo não encontrado.");
  return NextResponse.json({ data: serializarSubfluxo(flow) });
});

// PUT — { name?, keywords?, nodes?, edges? }: só o que vier muda. nodes e
// edges vêm juntos e substituem o desenho inteiro (mesma validação do principal).
export const PUT = rotaV1<P>({ recurso: "flows" }, async (ctx, { id, flowId }) => {
  const corpo = ctx.corpo();
  conferirCampos(corpo, ["name", "keywords", "nodes", "edges"]);
  const agente = await carregarAgente(ctx.orgId, id);
  const { flow, avisos } = await atualizarSubfluxo(ctx.orgId, id, flowId, corpo, { modo: "api", temUrlDoFluxo: !!agente.outboundUrl?.trim() });
  return NextResponse.json({ data: serializarSubfluxo(flow), warnings: avisos });
});

// DELETE — conversas que estavam nele voltam para o principal na próxima mensagem.
export const DELETE = rotaV1<P>({ recurso: "flows" }, async (ctx, { id, flowId }) => {
  await carregarAgente(ctx.orgId, id);
  await apagarSubfluxo(ctx.orgId, id, flowId);
  return NextResponse.json({ data: { id: flowId, deleted: true } });
});
