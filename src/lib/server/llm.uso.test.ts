import { describe, it, expect, vi, afterEach } from "vitest";
import { callLlmWithTools, comRascunho, somarUso, type LlmUsage } from "./llm";

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

describe("texto junto da ferramenta e temperatura", () => {
  const rodadas = () => [
    { choices: [{ message: { content: "Perfeito, anotei!", tool_calls: [{ id: "1", function: { name: "seguir_fluxo", arguments: "{}" } }] } }] },
    { choices: [{ message: { content: "" } }] },
  ];
  const pedido = (provider: "groq" | "openai") => ({
    provider, apiKey: "k", model: "m", systemPrompt: "", userMessage: "oi", temperature: 0.4,
    tools: [{ name: "seguir_fluxo", description: "", params: [] }], executeTool: async () => "ok",
  });

  it("não perde o que a IA escreveu junto da chamada de ferramenta", async () => {
    const respostas = rodadas();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(respostas.shift()), { status: 200 })));
    expect((await callLlmWithTools(pedido("groq"))).text).toBe("Perfeito, anotei!");
  });

  it("manda a temperatura na Groq e não na OpenAI", async () => {
    const corpos: Record<string, unknown>[] = [];
    for (const provider of ["groq", "openai"] as const) {
      const respostas = rodadas();
      vi.stubGlobal("fetch", vi.fn(async (_url: string, init: RequestInit) => {
        corpos.push(JSON.parse(String(init.body)));
        return new Response(JSON.stringify(respostas.shift()), { status: 200 });
      }));
      await callLlmWithTools(pedido(provider));
    }
    expect(corpos[0].temperature).toBe(0.4);
    expect(corpos[2]).not.toHaveProperty("temperature");
  });

  it("comRascunho junta sem repetir e devolve null quando não há texto", () => {
    expect(comRascunho(["Oi!"], "Oi!")).toBe("Oi!");
    expect(comRascunho(["Vou ver."], "Achei.")).toBe("Vou ver.\n\nAchei.");
    expect(comRascunho([" "], null)).toBeNull();
  });
});
