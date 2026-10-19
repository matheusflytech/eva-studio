import "server-only";
import type { Node, Edge } from "@xyflow/react";
import { prisma } from "@/lib/db/prisma";
import type { FlowNodeData } from "@/components/agent-studio/builder/flow-node";
import type { IconKey } from "@/components/agent-studio/builder/icon-registry";
import { validateFlow } from "@/components/agent-studio/builder/block-validation";
import { ErroApi } from "./http";

// ---------------------------------------------------------------------------
// Fluxo do agente pela API (API-4). O Builder salva sem validar (o canvas
// mostra as pendências); pela API não dá para "ver o canvas", então aqui o
// fluxo só entra se o motor (flow-engine.ts) conseguir executá-lo:
//   - exatamente um bloco Início;
//   - ids únicos; ligação só entre blocos que existem;
//   - tipo de bloco conhecido pelo construtor;
//   - nenhuma pendência de validateFlow (a mesma lista do painel do Builder);
//   - funil, etapa, etiqueta, credencial, servidor MCP e responsável da
//     própria organização (id de outra org nunca entra num bloco).
// ---------------------------------------------------------------------------

export const TIPOS_DE_BLOCO = [
  "start", "message", "capture", "agent", "condition", "variable", "webhook", "human", "wait", "end", "http", "email",
  "ai-agent", "tool-http", "tool-knowledge", "tool-mcp", "crm-deal", "crm-stage", "crm-task", "crm-tag", "crm-update",
  "crm-note", "crm-lookup", "tool-crm",
] as const satisfies readonly IconKey[];

export const MAX_BLOCOS_API = 200;
export const MAX_LIGACOES_API = 500;

export interface Problema {
  code: string;
  message: string;
  node_id?: string;
  edge_id?: string;
}

const TIPOS = new Set<string>(TIPOS_DE_BLOCO);
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const idValido = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 100;

/** Confere a forma e a lógica do grafo. Devolve o fluxo limpo ou lança 422 com a lista de problemas. */
export async function validarFluxo(orgId: string, bruto: { nodes?: unknown; edges?: unknown }) {
  const problemas: Problema[] = [];
  if (!Array.isArray(bruto.nodes) || !Array.isArray(bruto.edges)) {
    throw new ErroApi(400, "invalid_parameter", "Envie nodes e edges (listas).", { param: "nodes" });
  }
  if (bruto.nodes.length > MAX_BLOCOS_API) throw new ErroApi(422, "invalid_flow", `Máximo de ${MAX_BLOCOS_API} blocos.`);
  if (bruto.edges.length > MAX_LIGACOES_API) throw new ErroApi(422, "invalid_flow", `Máximo de ${MAX_LIGACOES_API} ligações.`);

  const nodes: Node<FlowNodeData>[] = [];
  const ids = new Set<string>();
  bruto.nodes.forEach((n, i) => {
    if (!obj(n) || !idValido(n.id) || !obj(n.data)) {
      problemas.push({ code: "invalid_node", message: `nodes[${i}] precisa de id (texto) e data (objeto).` });
      return;
    }
    if (ids.has(n.id)) problemas.push({ code: "duplicate_node_id", message: `Id repetido: ${n.id}.`, node_id: n.id });
    ids.add(n.id);
    const data = n.data as Record<string, unknown>;
    if (typeof data.iconKey !== "string" || !TIPOS.has(data.iconKey)) {
      problemas.push({ code: "unknown_block_type", message: `Tipo de bloco desconhecido: ${String(data.iconKey)}.`, node_id: n.id });
      return;
    }
    const pos = obj(n.position) && typeof n.position.x === "number" && typeof n.position.y === "number" ? n.position : { x: 0, y: 0 };
    nodes.push({
      id: n.id,
      type: typeof n.type === "string" ? n.type : "flowNode",
      position: { x: Number(pos.x), y: Number(pos.y) },
      data: { ...(data as unknown as FlowNodeData), label: typeof data.label === "string" ? data.label : String(data.iconKey) },
    });
  });

  const inicios = nodes.filter((n) => n.data.iconKey === "start");
  if (inicios.length !== 1) {
    problemas.push({ code: "start_block", message: inicios.length === 0 ? "O fluxo precisa de um bloco Início." : "O fluxo só pode ter um bloco Início." });
  }

  const edges: Edge[] = [];
  const idsDeLigacao = new Set<string>();
  bruto.edges.forEach((e, i) => {
    if (!obj(e) || !idValido(e.source) || !idValido(e.target)) {
      problemas.push({ code: "invalid_edge", message: `edges[${i}] precisa de source e target.` });
      return;
    }
    const id = idValido(e.id) ? e.id : `e-${e.source}-${e.target}-${i}`;
    if (idsDeLigacao.has(id)) problemas.push({ code: "duplicate_edge_id", message: `Id de ligação repetido: ${id}.`, edge_id: id });
    idsDeLigacao.add(id);
    for (const ponta of ["source", "target"] as const) {
      if (!ids.has(e[ponta] as string)) {
        problemas.push({ code: "dangling_edge", message: `Ligação ${id} aponta para um bloco que não existe (${String(e[ponta])}).`, edge_id: id });
      }
    }
    edges.push({
      id,
      source: e.source,
      target: e.target,
      ...(typeof e.sourceHandle === "string" ? { sourceHandle: e.sourceHandle } : {}),
      ...(typeof e.targetHandle === "string" ? { targetHandle: e.targetHandle } : {}),
      ...(typeof e.type === "string" ? { type: e.type } : {}),
    });
  });

  if (problemas.length === 0) {
    for (const p of validateFlow(nodes, edges)) problemas.push({ code: "block_incomplete", message: `${p.label}: ${p.motivo}`, node_id: p.nodeId });
    problemas.push(...(await conferirIdsDaOrg(orgId, nodes)));
  }

  if (problemas.length > 0) {
    throw new ErroApi(422, "invalid_flow", `O fluxo tem ${problemas.length} problema(s); nada foi salvo.`, { details: { issues: problemas } });
  }
  return { nodes, edges };
}

/** Todo id de outro registro dentro dos blocos precisa ser da organização. */
async function conferirIdsDaOrg(orgId: string, nodes: Node<FlowNodeData>[]): Promise<Problema[]> {
  const pegar = (f: (d: FlowNodeData) => unknown) =>
    [...new Set(nodes.flatMap((n) => [f(n.data)].flat().filter((v): v is string => typeof v === "string" && v.length > 0)))];
  const grupos: Array<[string, string[], (ids: string[]) => Promise<{ id: string }[]>]> = [
    ["Funil", pegar((d) => d.crmPipelineId), (ids) => prisma.pipeline.findMany({ where: { orgId, id: { in: ids } }, select: { id: true } })],
    [
      "Etapa",
      pegar((d) => [d.crmStageId, ...(d.crmAllowedStageIds ?? [])]),
      (ids) => prisma.pipelineStage.findMany({ where: { id: { in: ids }, pipeline: { orgId } }, select: { id: true } }),
    ],
    ["Etiqueta", pegar((d) => d.crmTagId), (ids) => prisma.tag.findMany({ where: { orgId, id: { in: ids } }, select: { id: true } })],
    [
      "Credencial",
      pegar((d) => [d.emailCredentialId, d.aiCredentialId]),
      (ids) => prisma.credential.findMany({ where: { orgId, id: { in: ids } }, select: { id: true } }),
    ],
    ["Servidor MCP", pegar((d) => d.mcpServerId), (ids) => prisma.mcpServer.findMany({ where: { orgId, id: { in: ids } }, select: { id: true } })],
    ["Responsável", pegar((d) => d.crmTaskAssigneeId), (ids) => prisma.profile.findMany({ where: { orgId, id: { in: ids } }, select: { id: true } })],
  ];
  const problemas: Problema[] = [];
  for (const [nome, lista, buscar] of grupos) {
    if (lista.length === 0) continue;
    const achados = new Set((await buscar(lista)).map((r) => r.id));
    for (const id of lista) {
      if (!achados.has(id)) problemas.push({ code: "invalid_reference", message: `${nome} ${id} não encontrado nesta organização.` });
    }
  }
  return problemas;
}

export async function carregarAgente(orgId: string, agentId: string) {
  const a = await prisma.agent.findFirst({ where: { id: agentId, orgId }, select: { id: true, name: true } });
  if (!a) throw new ErroApi(404, "not_found", "Agente não encontrado.");
  return a;
}

/** Substitui o fluxo guardando a versão anterior (é o desfazer). */
export async function substituirFluxo(orgId: string, agentId: string, fluxo: { nodes: Node<FlowNodeData>[]; edges: Edge[] }, origem = "api") {
  const anterior = await prisma.agentFlow.findUnique({ where: { agentId } });
  const nodes = fluxo.nodes as unknown as object;
  const edges = fluxo.edges as unknown as object;
  await prisma.$transaction([
    ...(anterior ? [prisma.agentFlowVersion.create({ data: { orgId, agentId, nodes: anterior.nodes as object, edges: anterior.edges as object, origem } })] : []),
    prisma.agentFlow.upsert({ where: { agentId }, create: { agentId, nodes, edges }, update: { nodes, edges } }),
  ]);
  return prisma.agentFlow.findUnique({ where: { agentId } });
}

export function serializarFluxo(agentId: string, f: { nodes: unknown; edges: unknown; updatedAt: Date } | null) {
  return { agent_id: agentId, nodes: f?.nodes ?? [], edges: f?.edges ?? [], updated_at: f ? f.updatedAt.toISOString() : null };
}
