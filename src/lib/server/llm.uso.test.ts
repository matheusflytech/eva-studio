import { describe, it, expect, vi, afterEach } from "vitest";
import { callLlmWithTools, somarUso, type LlmUsage } from "./llm";

afterEach(() => vi.unstubAllGlobals());

describe("somarUso", () => {
  it("entende o formato de cada provedor", () => {
    const t: LlmUsage = { entrada: 0, saida: 0 };
    somarUso(t, { usage: { prompt_tokens: 10, completion_tokens: 2 } });
    somarUso(t, { usage: { input_tokens: 5, output_tokens: 1 } });
    somarUso(t, { usageMetadata: { promptTokenCount: 7, candidatesTokenCount: 3 } });
    somarUso(t, { nada: 1 });
    expect(t).toEqual({ entrada: 22, saida: 6 });
  });
});

describe("callLlmWithTools devolve os tokens", () => {
  it("soma as rodadas de ferramenta", async () => {
    const respostas = [
      { choices: [{ message: { content: null, tool_calls: [{ id: "1", function: { name: "f", arguments: "{}" } }] } }], usage: { prompt_tokens: 100, completion_tokens: 10 } },
      { choices: [{ message: { content: "pronto" } }], usage: { prompt_tokens: 120, completion_tokens: 20 } },
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(respostas.shift()), { status: 200 })));
    const r = await callLlmWithTools({
      provider: "openai", apiKey: "k", model: "m", systemPrompt: "", userMessage: "oi",
      tools: [{ name: "f", description: "", params: [] }], executeTool: async () => "ok",
    });
    expect(r).toEqual({ text: "pronto", usage: { entrada: 220, saida: 30 } });
  });
});
