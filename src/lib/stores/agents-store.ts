import { create } from "zustand";
import * as agentsApi from "@/lib/data/agents";
import type { Agent, AgentInput } from "@/lib/data/types";

interface AgentsState {
  agents: Agent[];
  isLoaded: boolean;
  load: () => Promise<void>;
  create: (id: string, input: AgentInput) => Promise<Agent>;
  update: (id: string, input: AgentInput) => Promise<Agent>;
  remove: (id: string) => Promise<void>;
  toggleStatus: (id: string) => Promise<Agent>;
}

export const useAgentsStore = create<AgentsState>((set, get) => ({
  agents: [],
  isLoaded: false,

  load: async () => {
    const agents = await agentsApi.listAgents();
    set({ agents, isLoaded: true });
  },

  create: async (id, input) => {
    const agent = await agentsApi.createAgent(id, input);
    set({ agents: [agent, ...get().agents] });
    return agent;
  },

  update: async (id, input) => {
    const agent = await agentsApi.updateAgent(id, input);
    set({ agents: get().agents.map((a) => (a.id === id ? agent : a)) });
    return agent;
  },

  remove: async (id) => {
    await agentsApi.deleteAgent(id);
    set({ agents: get().agents.filter((a) => a.id !== id) });
  },

  toggleStatus: async (id) => {
    const agent = await agentsApi.toggleAgentStatus(id);
    set({ agents: get().agents.map((a) => (a.id === id ? agent : a)) });
    return agent;
  },
}));
