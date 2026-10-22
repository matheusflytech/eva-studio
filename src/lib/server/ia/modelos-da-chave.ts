import "server-only";
import { getProvider, type LlmProvider } from "@/lib/llm-providers";

// ---------------------------------------------------------------------------
// Modelos que a chave do cliente enxerga, perguntando ao próprio provedor.
//
// O catálogo fixo (llm-providers.ts) envelhece rápido: cada provedor lança
// modelo novo todo mês e cada conta vê um conjunto diferente (preview, plano,
// região). Perguntar à API com a chave de quem vai usar resolve as duas coisas.
// O catálogo fixo continua como reserva quando a chamada falha.
//
//   openai-compat → GET {base}/models (Bearer)          → data[].id
//   anthropic     → GET {base}/models (x-api-key)       → data[].id, display_name
//   google        → GET {base}/models (x-goog-api-key)  → models[].name, displayName
// ---------------------------------------------------------------------------

export interface ModeloDaChave {
  id: string;
  label: string;
}

// Nas APIs no formato OpenAI a lista traz de tudo (áudio, imagem, embeddings,
// moderação). O bloco de IA só conversa, então fica só o que é chat.
const NAO_E_CHAT = /(embed|whisper|tts|orpheus|playai|dall-e|moderation|image|audio|realtime|transcribe|search|computer-use|davinci|babbage|guard)/i;

/** Lê a resposta crua de cada provedor e devolve só modelos de conversa, em ordem alfabética. */
export function extrairModelos(provider: LlmProvider, corpo: unknown): ModeloDaChave[] {
  const formato = getProvider(provider).format;
  const lista: ModeloDaChave[] = [];
  const c = (corpo ?? {}) as Record<string, unknown>;

  if (formato === "google") {
    for (const m of (Array.isArray(c.models) ? c.models : []) as Record<string, unknown>[]) {
      const metodos = Array.isArray(m.supportedGenerationMethods) ? m.supportedGenerationMethods : [];
      if (!metodos.includes("generateContent")) continue;
      const id = String(m.name ?? "").replace(/^models\//, "");
      if (!id || NAO_E_CHAT.test(id)) continue;
      lista.push({ id, label: String(m.displayName ?? id) });
    }
  } else {
    for (const m of (Array.isArray(c.data) ? c.data : []) as Record<string, unknown>[]) {
      const id = String(m.id ?? "");
      if (!id || NAO_E_CHAT.test(id)) continue;
      lista.push({ id, label: String(m.display_name ?? m.name ?? id) });
    }
  }

  const unicos = new Map(lista.map((m) => [m.id, m]));
  return [...unicos.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export async function listarModelosDaChave(
  provider: LlmProvider,
  apiKey: string
): Promise<{ modelos: ModeloDaChave[]; erro?: string }> {
  const info = getProvider(provider);
  const headers: Record<string, string> =
    info.format === "anthropic"
      ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01" }
      : info.format === "google"
        ? { "x-goog-api-key": apiKey }
        : { Authorization: `Bearer ${apiKey}` };
  const url = `${info.baseUrl}/models${info.format === "anthropic" ? "?limit=1000" : info.format === "google" ? "?pageSize=1000" : ""}`;

  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000), cache: "no-store" });
    if (!res.ok) {
      const motivo = res.status === 401 || res.status === 403 ? "a chave foi recusada pelo provedor" : `o provedor respondeu ${res.status}`;
      return { modelos: [], erro: `Não deu para listar os modelos: ${motivo}.` };
    }
    return { modelos: extrairModelos(provider, await res.json()) };
  } catch {
    return { modelos: [], erro: "Não deu para falar com o provedor agora. Tente de novo em instantes." };
  }
}
