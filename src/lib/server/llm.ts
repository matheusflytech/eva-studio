import "server-only";
import { getProvider, type LlmProvider } from "@/lib/llm-providers";

// ---------------------------------------------------------------------------
// Camada única de chamada de LLM, com tool calling, para todos os provedores.
//
// Substitui o groq.ts (que só falava com a Groq). Três formatos de API cobrem
// tudo que o app oferece:
//   openai-compat → Groq, OpenAI, DeepSeek, OpenRouter, xAI
//   anthropic     → /v1/messages
//   google        → generateContent
//
// Tudo com fetch puro, sem SDK: é o padrão já usado no resto do motor, e
// manter assim evita somar três SDKs ao bundle serverless da Vercel (o
// tamanho da função já foi motivo de corte de escopo neste projeto).
// ---------------------------------------------------------------------------

export interface LlmToolParam {
  name: string;
  description?: string;
  /** false = opcional no schema. Default true. */
  required?: boolean;
}

export interface LlmTool {
  name: string;
  description: string;
  params: LlmToolParam[];
}

export interface LlmToolCall {
  id: string;
  name: string;
  arguments: Record<string, string>;
}

export interface CallLlmOptions {
  provider: LlmProvider;
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  history?: { role: "user" | "assistant"; content: string }[];
  tools: LlmTool[];
  executeTool: (call: LlmToolCall) => Promise<string>;
  maxIterations?: number;
  /** Só usado por provedores que expõem controle de esforço (Anthropic). */
  effort?: "low" | "medium" | "high";
  maxTokens?: number;
}

export interface LlmResult {
  text: string | null;
  error?: string;
}

const DEFAULT_MAX_TOKENS = 2048;

function safeJsonParse(raw: string): Record<string, string> {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // Argumentos mal formados: segue com objeto vazio em vez de travar o turno.
    return {};
  }
}

function jsonSchemaFor(tool: LlmTool) {
  const properties: Record<string, { type: string; description?: string }> = {};
  for (const p of tool.params) properties[p.name] = { type: "string", description: p.description };
  return {
    type: "object" as const,
    properties,
    required: tool.params.filter((p) => p.required !== false).map((p) => p.name),
  };
}

// ---------------------------------------------------------------------------
// Formato OpenAI (Groq, OpenAI, DeepSeek, OpenRouter, xAI)
// ---------------------------------------------------------------------------

interface OpenAiMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

async function callOpenAiCompatible(opts: CallLlmOptions, baseUrl: string): Promise<LlmResult> {
  const messages: OpenAiMessage[] = [
    { role: "system", content: opts.systemPrompt || "Você é um assistente útil." },
    ...(opts.history ?? []),
    { role: "user", content: opts.userMessage },
  ];
  const tools = opts.tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: jsonSchemaFor(t) },
  }));

  for (let i = 0; i < (opts.maxIterations ?? 4); i += 1) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        model: opts.model,
        messages,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
      }),
    });
    if (!res.ok) return { text: null, error: `${opts.provider} ${res.status}: ${(await res.text()).slice(0, 300)}` };

    const data = await res.json();
    const choice = data?.choices?.[0]?.message;
    if (!choice) return { text: null, error: "Resposta sem conteúdo." };

    if (choice.tool_calls?.length) {
      messages.push({ role: "assistant", content: choice.content ?? null, tool_calls: choice.tool_calls });
      for (const call of choice.tool_calls as { id: string; function: { name: string; arguments: string } }[]) {
        const result = await opts.executeTool({
          id: call.id,
          name: call.function.name,
          arguments: safeJsonParse(call.function.arguments),
        });
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
      continue;
    }

    return { text: typeof choice.content === "string" ? choice.content : null };
  }

  return { text: null, error: "Excedeu o limite de rodadas de ferramenta sem resposta final." };
}

// ---------------------------------------------------------------------------
// Formato Anthropic (/v1/messages)
// ---------------------------------------------------------------------------

interface AnthropicBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, string>;
}

type AnthropicContent = string | (AnthropicBlock | Record<string, unknown>)[];

async function callAnthropic(opts: CallLlmOptions, baseUrl: string): Promise<LlmResult> {
  const messages: { role: "user" | "assistant"; content: AnthropicContent }[] = [
    ...(opts.history ?? []).map((h) => ({ role: h.role, content: h.content })),
    { role: "user" as const, content: opts.userMessage },
  ];

  const tools = opts.tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: jsonSchemaFor(t),
  }));

  for (let i = 0; i < (opts.maxIterations ?? 4); i += 1) {
    const res = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": opts.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: opts.model,
        max_tokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS,
        // `system` é campo de primeiro nível na Anthropic, não uma mensagem.
        system: opts.systemPrompt || "Você é um assistente útil.",
        messages,
        // Esforço controla profundidade de raciocínio. Numa resposta de
        // chatbot o que importa é latência, então o padrão é "low" — quem
        // quiser mais qualidade muda no bloco.
        output_config: { effort: opts.effort ?? "low" },
        ...(tools.length > 0 ? { tools } : {}),
        // Nada de temperature/top_p: a família 4.6+ rejeita esses campos com 400.
      }),
    });
    if (!res.ok) return { text: null, error: `anthropic ${res.status}: ${(await res.text()).slice(0, 300)}` };

    const data = await res.json();

    // Um classificador de segurança pode recusar o pedido com HTTP 200.
    // Precisa ser checado antes de ler o conteúdo, senão vira "resposta vazia"
    // sem explicação nenhuma pra quem está usando.
    if (data?.stop_reason === "refusal") {
      return { text: null, error: `Pedido recusado pelo modelo (${data?.stop_details?.category ?? "sem categoria"}).` };
    }

    const blocks: AnthropicBlock[] = Array.isArray(data?.content) ? data.content : [];
    const toolUses = blocks.filter((b) => b.type === "tool_use");

    if (toolUses.length > 0) {
      messages.push({ role: "assistant", content: blocks as unknown as AnthropicContent });
      const results = [];
      for (const use of toolUses) {
        const output = await opts.executeTool({
          id: use.id ?? "",
          name: use.name ?? "",
          arguments: (use.input ?? {}) as Record<string, string>,
        });
        results.push({ type: "tool_result", tool_use_id: use.id, content: output });
      }
      // Todos os resultados voltam numa ÚNICA mensagem de usuário — separar em
      // várias faz o modelo parar de pedir ferramentas em paralelo.
      messages.push({ role: "user", content: results as unknown as AnthropicContent });
      continue;
    }

    const text = blocks
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("")
      .trim();
    return { text: text || null };
  }

  return { text: null, error: "Excedeu o limite de rodadas de ferramenta sem resposta final." };
}

// ---------------------------------------------------------------------------
// Formato Google (generateContent)
// ---------------------------------------------------------------------------

interface GeminiPart {
  text?: string;
  functionCall?: { name: string; args: Record<string, string> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

async function callGoogle(opts: CallLlmOptions, baseUrl: string): Promise<LlmResult> {
  const contents: { role: "user" | "model"; parts: GeminiPart[] }[] = [
    ...(opts.history ?? []).map((h) => ({
      // Gemini chama o lado do assistente de "model".
      role: (h.role === "assistant" ? "model" : "user") as "user" | "model",
      parts: [{ text: h.content }],
    })),
    { role: "user", parts: [{ text: opts.userMessage }] },
  ];

  const functionDeclarations = opts.tools.map((t) => ({
    name: t.name,
    description: t.description,
    parameters: jsonSchemaFor(t),
  }));

  for (let i = 0; i < (opts.maxIterations ?? 4); i += 1) {
    const res = await fetch(`${baseUrl}/models/${opts.model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": opts.apiKey },
      body: JSON.stringify({
        contents,
        systemInstruction: { parts: [{ text: opts.systemPrompt || "Você é um assistente útil." }] },
        generationConfig: { maxOutputTokens: opts.maxTokens ?? DEFAULT_MAX_TOKENS },
        ...(functionDeclarations.length > 0 ? { tools: [{ functionDeclarations }] } : {}),
      }),
    });
    if (!res.ok) return { text: null, error: `google ${res.status}: ${(await res.text()).slice(0, 300)}` };

    const data = await res.json();
    const parts: GeminiPart[] = data?.candidates?.[0]?.content?.parts ?? [];
    const calls = parts.filter((p) => p.functionCall);

    if (calls.length > 0) {
      contents.push({ role: "model", parts });
      const responseParts: GeminiPart[] = [];
      for (const part of calls) {
        const call = part.functionCall!;
        const output = await opts.executeTool({ id: call.name, name: call.name, arguments: call.args ?? {} });
        responseParts.push({ functionResponse: { name: call.name, response: { result: output } } });
      }
      contents.push({ role: "user", parts: responseParts });
      continue;
    }

    const text = parts.map((p) => p.text ?? "").join("").trim();
    return { text: text || null };
  }

  return { text: null, error: "Excedeu o limite de rodadas de ferramenta sem resposta final." };
}

// ---------------------------------------------------------------------------

/**
 * Ponto único de chamada. Escolhe o formato pelo provedor e devolve o texto
 * final (ou o erro legível, que sobe pra aba Execuções do Builder).
 */
export async function callLlmWithTools(opts: CallLlmOptions): Promise<LlmResult> {
  const provider = getProvider(opts.provider);
  try {
    if (provider.format === "anthropic") return await callAnthropic(opts, provider.baseUrl);
    if (provider.format === "google") return await callGoogle(opts, provider.baseUrl);
    return await callOpenAiCompatible(opts, provider.baseUrl);
  } catch (err) {
    return { text: null, error: err instanceof Error ? err.message : String(err) };
  }
}
