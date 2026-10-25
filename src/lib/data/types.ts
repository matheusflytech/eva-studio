export interface ContratoDaSessao {
  id: string;
  name: string;
  logoUrl: string | null;
}

export interface Session {
  userId: string;
  name: string;
  email: string;
  orgName: string;
  orgLogoUrl?: string;
  /** Contrato ativo (o da URL, já conferido no servidor). */
  contratoId?: string;
  /** Papel de sistema base no contrato e, se houver, o personalizado. */
  papel?: string;
  papelNome?: string;
  permissoes?: string[];
  superadmin?: boolean;
  /** Contratos que a pessoa pode abrir (seletor do menu). */
  contratos?: ContratoDaSessao[];
  /** Para onde ir quando a URL não diz (/go, sem acesso). */
  contratoPadrao?: string | null;
  /** A URL pediu um contrato onde a pessoa não tem vínculo. */
  semAcesso?: boolean;
}

export interface KnowledgeDoc {
  id: string;
  fileName: string;
  sizeBytes: number;
  mimeType: string;
  uploadedAt: string;
}

export interface WebhookConfig {
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
