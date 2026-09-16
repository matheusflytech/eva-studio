import "server-only";

// Chamada direta na API da Groq (compatível com o formato da OpenAI), sem
// SDK novo — mesmo estilo "fetch puro" já usado no resto do motor (webhook,
// n8n). Suporta tool-calling: se o modelo pedir pra chamar uma ferramenta, o
// loop chama `executeTool`, devolve o resultado pro modelo e repete até ele
// responder texto final (ou estourar o limite de rodadas).

export interface GroqToolParam {
  name: string;
  description?: string;
  // false = campo opcional no JSON schema (ex: ferramenta de salvar dados
  // coletados, onde o modelo pode preencher só o que descobriu nesse turno).
  // Default true, igual o comportamento antigo (todo param era obrigatório).
  required?: boolean;
}

export interface GroqTool {
  name: string;
  description: string;
  params: GroqToolParam[];
}

export interface GroqToolCall {
  id: string;
  name: string;
  arguments: Record<string, string>;
}

interface GroqMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

function toolToFunctionSchema(tool: GroqTool) {
  const properties: Record<string, { type: string; description?: string }> = {};
  for (const p of tool.params) properties[p.name] = { type: "string", description: p.description };
  return {
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties,
        required: tool.params.filter((p) => p.required !== false).map((p) => p.name),
      },
    },
  };
}

export async function callGroqWithTools(opts: {
  apiKey: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  // Turnos anteriores da conversa (janela deslizante, sem sumarização) — o
  // mesmo padrão de "Buffer Window Memory" do Flowise/n8n: uma query simples
  // pelas últimas N mensagens, sem embeddings nem serviço novo.
  history?: { role: "user" | "assistant"; content: string }[];
  tools: GroqTool[];
  executeTool: (call: GroqToolCall) => Promise<string>;
  maxIterations?: number;
}): Promise<string | null> {
  const messages: GroqMessage[] = [
    { role: "system", content: opts.systemPrompt || "Você é um assistente útil." },
    ...(opts.history ?? []),
    { role: "user", content: opts.userMessage },
  ];
  const tools = opts.tools.map(toolToFunctionSchema);
  const maxIterations = opts.maxIterations ?? 4;

  for (let i = 0; i < maxIterations; i += 1) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
      body: JSON.stringify({
        model: opts.model,
        messages,
        ...(tools.length > 0 ? { tools, tool_choice: "auto" } : {}),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const choice = data?.choices?.[0]?.message;
    if (!choice) return null;

    if (choice.tool_calls?.length) {
      messages.push({ role: "assistant", content: choice.content ?? null, tool_calls: choice.tool_calls });
      for (const call of choice.tool_calls as { id: string; function: { name: string; arguments: string } }[]) {
        let args: Record<string, string> = {};
        try {
          args = JSON.parse(call.function.arguments || "{}");
        } catch {
          // argumentos mal formados — segue com objeto vazio em vez de travar
        }
        const result = await opts.executeTool({ id: call.id, name: call.function.name, arguments: args });
        messages.push({ role: "tool", tool_call_id: call.id, content: result });
      }
      continue; // manda de volta pro modelo com o resultado da ferramenta
    }

    return typeof choice.content === "string" ? choice.content : null;
  }

  return null; // estourou o limite de rodadas de tool-calling sem resposta final
}
