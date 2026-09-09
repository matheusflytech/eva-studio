export interface Session {
  userId: string;
  name: string;
  email: string;
  orgName: string;
  orgLogoUrl?: string;
}

export interface KnowledgeDoc {
  id: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  uploadedAt: string;
}

export interface WebhookConfig {
  inboundUrl: string;
  outboundUrl: string;
}

export interface AgentVariable {
  id: string;
  name: string;
  unit: string;
}

export const AGENT_LANGUAGES = ["Português", "Inglês", "Espanhol"] as const;
export type AgentLanguage = (typeof AGENT_LANGUAGES)[number];

export interface Agent {
  id: string;
  name: string;
  description: string;
  tone: string;
  language: AgentLanguage;
  primaryChannel: string;
  instructions: string;
  guidelines: string;
  knowledgeBase: KnowledgeDoc[];
  skills: string[];
  tools: string[];
  variables: AgentVariable[];
  webhook: WebhookConfig;
  status: "active" | "paused";
  createdAt: string;
  updatedAt: string;
}

export type AgentInput = Pick<
  Agent,
  "name" | "description" | "tone" | "language" | "primaryChannel" | "instructions" | "guidelines" | "skills" | "tools" | "variables"
> & {
  knowledgeBase: KnowledgeDoc[];
  outboundUrl: string;
};
