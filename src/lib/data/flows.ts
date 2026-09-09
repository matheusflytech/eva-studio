import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "@/components/agent-studio/builder/flow-node";

export interface AgentFlow {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
}

export async function getFlow(agentId: string): Promise<AgentFlow | null> {
  const res = await fetch(`/api/flows/${agentId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Erro inesperado.");
  return data.flow;
}

export async function saveFlow(agentId: string, flow: AgentFlow): Promise<void> {
  const res = await fetch(`/api/flows/${agentId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(flow),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? "Erro inesperado.");
  }
}
