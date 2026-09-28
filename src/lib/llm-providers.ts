// Catálogo de provedores de IA. Fica FORA de server-only de propósito: o
// Inspector do Builder importa isso pra montar os seletores de provedor e
// modelo, e a lista de modelos precisa ser a mesma nos dois lados.
//
// Formato da API por provedor:
//   openai-compat → Groq, OpenAI, DeepSeek, OpenRouter, xAI (mesmo corpo da
//                   OpenAI, só muda a URL base)
//   anthropic     → /v1/messages, formato próprio de tool use
//   google        → generateContent, formato próprio (functionDeclarations)

export type LlmProvider = "groq" | "openai" | "anthropic" | "google" | "deepseek" | "openrouter" | "xai";

export type LlmApiFormat = "openai-compat" | "anthropic" | "google";

export interface LlmProviderInfo {
  id: LlmProvider;
  label: string;
  format: LlmApiFormat;
  baseUrl: string;
  /** Tipo de Credential aceito (o mesmo valor gravado em Credential.type). */
  credentialType: string;
  models: { id: string; label: string }[];
  /** Onde o usuário pega a chave — mostrado na tela de Integrações. */
  keyUrl: string;
}

export const LLM_PROVIDERS: LlmProviderInfo[] = [
  {
    id: "groq",
    label: "Groq",
    format: "openai-compat",
    baseUrl: "https://api.groq.com/openai/v1",
    credentialType: "groq",
    keyUrl: "https://console.groq.com/keys",
    models: [
      { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B" },
      { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B (rápido)" },
      { id: "openai/gpt-oss-120b", label: "GPT-OSS 120B" },
      { id: "moonshotai/kimi-k2-instruct", label: "Kimi K2" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    format: "openai-compat",
    baseUrl: "https://api.openai.com/v1",
    credentialType: "openai",
    keyUrl: "https://platform.openai.com/api-keys",
    models: [
      { id: "gpt-5.2", label: "GPT-5.2" },
      { id: "gpt-5.2-mini", label: "GPT-5.2 mini" },
      { id: "gpt-4.1", label: "GPT-4.1" },
      { id: "gpt-4.1-mini", label: "GPT-4.1 mini" },
    ],
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    format: "anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    credentialType: "anthropic",
    keyUrl: "https://console.anthropic.com/settings/keys",
    models: [
      { id: "claude-opus-5", label: "Claude Opus 5" },
      { id: "claude-sonnet-5", label: "Claude Sonnet 5" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 (rápido)" },
    ],
  },
  {
    id: "google",
    label: "Google (Gemini)",
    format: "google",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta",
    credentialType: "google",
    keyUrl: "https://aistudio.google.com/apikey",
    models: [
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash (rápido)" },
    ],
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    format: "openai-compat",
    baseUrl: "https://api.deepseek.com/v1",
    credentialType: "deepseek",
    keyUrl: "https://platform.deepseek.com/api_keys",
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner" },
    ],
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    format: "openai-compat",
    baseUrl: "https://openrouter.ai/api/v1",
    credentialType: "openrouter",
    keyUrl: "https://openrouter.ai/keys",
    models: [
      { id: "anthropic/claude-opus-5", label: "Claude Opus 5 (via OpenRouter)" },
      { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro (via OpenRouter)" },
      { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B (via OpenRouter)" },
    ],
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    format: "openai-compat",
    baseUrl: "https://api.x.ai/v1",
    credentialType: "xai",
    keyUrl: "https://console.x.ai",
    models: [{ id: "grok-4", label: "Grok 4" }],
  },
];

export function getProvider(id: string | undefined): LlmProviderInfo {
  // Bloco antigo (antes do multi-LLM) não tem provedor gravado — era sempre
  // Groq, então é esse o padrão pra não quebrar fluxo já publicado.
  return LLM_PROVIDERS.find((p) => p.id === id) ?? LLM_PROVIDERS[0];
}

/** Todos os tipos de credencial aceitos pelo app (LLM + embeddings + e-mail). */
export const CREDENTIAL_TYPES: { value: string; label: string }[] = [
  ...LLM_PROVIDERS.map((p) => ({ value: p.credentialType, label: p.label })),
  { value: "resend", label: "Resend (e-mail)" },
];
