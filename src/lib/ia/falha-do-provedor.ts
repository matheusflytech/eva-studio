import { LLM_PROVIDERS, type LlmProvider } from "@/lib/llm-providers";

// ---------------------------------------------------------------------------
// Erro do provedor de IA → frase que diz o que fazer. Antes toda falha virava
// "A IA não conseguiu responder agora", e chave recusada parecia instabilidade.
// Entrada: o `error` do callLlm ("groq 401: {...}", "anthropic 429: ...").
// Nunca devolve o corpo do erro (pode ecoar parte da chave).
// ---------------------------------------------------------------------------

export function mensagemDeFalhaDaIa(provider: LlmProvider, model: string, erro: string | undefined): string {
  const nome = LLM_PROVIDERS.find((p) => p.id === provider)?.label ?? provider;
  const status = Number(/^\S+ (\d{3}):/.exec(erro ?? "")?.[1] ?? 0);
  const corpo = (erro ?? "").toLowerCase();

  if (status === 401 || status === 403 || corpo.includes("invalid_api_key") || corpo.includes("invalid api key")) {
    return `A ${nome} recusou a chave de IA cadastrada. Confira em Integrações se a chave foi copiada inteira e se está ativa na conta ${nome}.`;
  }
  if (status === 404 || corpo.includes("model_not_found") || corpo.includes("does not exist")) {
    return `O modelo ${model} não está liberado nessa conta ${nome}. Libere o modelo na ${nome} ou cadastre a chave de outro provedor.`;
  }
  if (status === 429) return `A conta ${nome} chegou no limite de uso. Espere alguns minutos ou aumente o plano na ${nome}.`;
  if (status === 413) return `O pedido ficou grande demais para o plano da conta ${nome}. Tente um pedido mais curto ou um plano maior.`;
  if (status >= 500) return `A ${nome} está instável agora. Tente de novo em instantes.`;
  if (corpo.includes("demorou mais")) return `A ${nome} demorou demais para responder. Tente de novo em instantes.`;
  return "A IA não conseguiu responder agora. Tente de novo em instantes.";
}
