import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { Edge, Node } from "@xyflow/react";
import type { FlowNodeData } from "@/components/agent-studio/builder/flow-node";
import { rotaV1 } from "@/lib/server/api-v1/rota";
import { ErroApi } from "@/lib/server/api-v1/http";
import { conferirCampos, idOpc } from "@/lib/server/api-v1/entrada";
import { carregarAgente, serializarFluxo, substituirFluxo } from "@/lib/server/api-v1/fluxos";

// POST /api/v1/agents/{id}/flow/restore — { version_id? } (padrão: a mais
// recente). O fluxo atual vira uma versão também, então restaurar é desfazível.
export const POST = rotaV1<{ id: string }>({ recurso: "flows" }, async (ctx, { id }) => {
  const corpo = ctx.corpoBruto.trim() ? ctx.corpo() : {};
  conferirCampos(corpo, ["version_id"]);
  await carregarAgente(ctx.orgId, id);
  const versionId = idOpc(corpo, "version_id");
  const versao = await prisma.agentFlowVersion.findFirst({
    where: { agentId: id, orgId: ctx.orgId, ...(versionId ? { id: versionId } : {}) },
    orderBy: { createdAt: "desc" },
  });
  if (!versao) throw new ErroApi(404, "not_found", "Nenhuma versão anterior para restaurar.");
  const salvo = await substituirFluxo(
    ctx.orgId,
    id,
    { nodes: versao.nodes as unknown as Node<FlowNodeData>[], edges: versao.edges as unknown as Edge[] },
    "restauracao"
  );
  return NextResponse.json({ data: serializarFluxo(id, salvo), restored_version_id: versao.id });
});
