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

// ── Fluxos extras do bot (S4) ──────────────────────────────────────────────

export interface Subfluxo {
  id: string;
  name: string;
  keywords: string[];
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init ? { ...init, headers: { "Content-Type": "application/json" } } : undefined);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Erro inesperado.");
  return data as T;
}

export const listSubflows = (agentId: string) => pedir<{ flows: Subfluxo[] }>(`/api/flows/${agentId}/subflows`).then((d) => d.flows);

export const createSubflow = (agentId: string, name: string) =>
  pedir<{ flow: Subfluxo }>(`/api/flows/${agentId}/subflows`, { method: "POST", body: JSON.stringify({ name }) }).then((d) => d.flow);

export const getSubflow = (agentId: string, flowId: string) =>
  pedir<{ flow: Subfluxo & AgentFlow }>(`/api/flows/${agentId}/subflows/${flowId}`).then((d) => d.flow);

export const saveSubflow = (agentId: string, flowId: string, parte: Partial<AgentFlow> & { name?: string; keywords?: string[] }) =>
  pedir(`/api/flows/${agentId}/subflows/${flowId}`, { method: "PUT", body: JSON.stringify(parte) }).then(() => undefined);

export const deleteSubflow = (agentId: string, flowId: string) =>
  pedir(`/api/flows/${agentId}/subflows/${flowId}`, { method: "DELETE" }).then(() => undefined);

/** O bot inteiro (principal + extras) no pacote "eva.flows". */
export const exportBundle = (agentId: string) => pedir<Record<string, unknown>>(`/api/flows/${agentId}/bundle`);

export const importBundle = (agentId: string, pacote: unknown) =>
  pedir<{ criados: number; atualizados: number; avisos: { message: string }[] }>(`/api/flows/${agentId}/bundle`, {
    method: "POST",
    body: JSON.stringify(pacote),
  });
