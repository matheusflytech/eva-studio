import { readStorage, writeStorage } from "@/lib/data/storage";
import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "@/components/agent-studio/builder/flow-node";

export interface AgentFlow {
  nodes: Node<FlowNodeData>[];
  edges: Edge[];
}

type StoredFlows = Record<string, AgentFlow>;

const FLOWS_KEY = "agent-flows";

export async function getFlow(agentId: string): Promise<AgentFlow | null> {
  const all = readStorage<StoredFlows>(FLOWS_KEY, {});
  return all[agentId] ?? null;
}

export async function saveFlow(agentId: string, flow: AgentFlow): Promise<void> {
  const all = readStorage<StoredFlows>(FLOWS_KEY, {});
  all[agentId] = flow;
  writeStorage(FLOWS_KEY, all);
}
