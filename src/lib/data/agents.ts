// Mock CRUD layer for agents — localStorage-backed for now.
// Async signatures are intentional: swapping this file's internals for real
// fetch() calls to a backend API later won't require touching any caller.

import { buildInboundWebhookUrl } from "@/lib/utils";
import { readStorage, writeStorage } from "@/lib/data/storage";
import { AGENT_LANGUAGES } from "@/lib/data/types";
import type { Agent, AgentInput } from "@/lib/data/types";

const AGENTS_KEY = "agents";

// Defaults fields added after some agents were already saved to localStorage,
// so older records won't have them yet.
function normalizeAgent(agent: Agent): Agent {
  return {
    ...agent,
    tone: agent.tone ?? "",
    language: agent.language ?? AGENT_LANGUAGES[0],
    primaryChannel: agent.primaryChannel ?? "",
    instructions: agent.instructions ?? "",
    guidelines: agent.guidelines ?? "",
    tools: agent.tools ?? [],
    variables: agent.variables ?? [],
  };
}

function getAll(): Agent[] {
  return readStorage<Agent[]>(AGENTS_KEY, []).map(normalizeAgent);
}

function saveAll(agents: Agent[]): void {
  writeStorage(AGENTS_KEY, agents);
}

export async function listAgents(): Promise<Agent[]> {
  return getAll().sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
}

export async function getAgent(id: string): Promise<Agent | null> {
  return getAll().find((a) => a.id === id) ?? null;
}

export async function createAgent(id: string, input: AgentInput): Promise<Agent> {
  const now = new Date().toISOString();
  const agent: Agent = {
    id,
    name: input.name,
    description: input.description,
    tone: input.tone,
    language: input.language,
    primaryChannel: input.primaryChannel,
    instructions: input.instructions,
    guidelines: input.guidelines,
    knowledgeBase: input.knowledgeBase,
    skills: input.skills,
    tools: input.tools,
    variables: input.variables,
    webhook: {
      inboundUrl: buildInboundWebhookUrl(id),
      outboundUrl: input.outboundUrl,
    },
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  saveAll([...getAll(), agent]);
  return agent;
}

export async function updateAgent(id: string, input: AgentInput): Promise<Agent> {
  const agents = getAll();
  const existing = agents.find((a) => a.id === id);
  if (!existing) throw new Error("Agente não encontrado");
  const updated: Agent = {
    ...existing,
    name: input.name,
    description: input.description,
    tone: input.tone,
    language: input.language,
    primaryChannel: input.primaryChannel,
    instructions: input.instructions,
    guidelines: input.guidelines,
    knowledgeBase: input.knowledgeBase,
    skills: input.skills,
    tools: input.tools,
    variables: input.variables,
    webhook: { ...existing.webhook, outboundUrl: input.outboundUrl },
    updatedAt: new Date().toISOString(),
  };
  saveAll(agents.map((a) => (a.id === id ? updated : a)));
  return updated;
}

export async function deleteAgent(id: string): Promise<void> {
  saveAll(getAll().filter((a) => a.id !== id));
}

export async function toggleAgentStatus(id: string): Promise<Agent> {
  const agents = getAll();
  const existing = agents.find((a) => a.id === id);
  if (!existing) throw new Error("Agente não encontrado");
  const updated: Agent = {
    ...existing,
    status: existing.status === "active" ? "paused" : "active",
    updatedAt: new Date().toISOString(),
  };
  saveAll(agents.map((a) => (a.id === id ? updated : a)));
  return updated;
}
