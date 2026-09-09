// Real CRUD layer for agents — talks to /api/agents (Supabase + Prisma).
// Signatures match the old localStorage-backed version exactly, so callers
// (the zustand store, every page/component) needed zero changes.

import type { Agent, AgentInput } from "@/lib/data/types";

async function parseOrThrow(res: Response) {
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Erro inesperado.");
  return data;
}

export async function listAgents(): Promise<Agent[]> {
  const res = await fetch("/api/agents");
  const data = await parseOrThrow(res);
  return data.agents;
}

export async function getAgent(id: string): Promise<Agent | null> {
  const res = await fetch(`/api/agents/${id}`);
  const data = await parseOrThrow(res);
  return data.agent;
}

export async function createAgent(id: string, input: AgentInput): Promise<Agent> {
  const res = await fetch("/api/agents", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...input }),
  });
  const data = await parseOrThrow(res);
  return data.agent;
}

export async function updateAgent(id: string, input: AgentInput): Promise<Agent> {
  const res = await fetch(`/api/agents/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await parseOrThrow(res);
  return data.agent;
}

export async function deleteAgent(id: string): Promise<void> {
  const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
  await parseOrThrow(res);
}

export async function toggleAgentStatus(id: string): Promise<Agent> {
  const res = await fetch(`/api/agents/${id}/status`, { method: "POST" });
  const data = await parseOrThrow(res);
  return data.agent;
}
