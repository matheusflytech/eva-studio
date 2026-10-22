import { describe, it, expect, vi, afterEach } from "vitest";
import { extrairModelos, listarModelosDaChave } from "./modelos-da-chave";

afterEach(() => vi.unstubAllGlobals());

describe("extrairModelos", () => {
  it("formato OpenAI: só modelos de conversa, sem repetir, em ordem", () => {
    const corpo = {
      data: [
        { id: "gpt-5.6-luna" },
        { id: "text-embedding-3-large" },
        { id: "whisper-1" },
        { id: "gpt-4.1-mini" },
        { id: "gpt-image-1" },
        { id: "gpt-4.1-mini" },
        { id: "gpt-4o-realtime-preview" },
        { id: "canopylabs/orpheus-v1-english" },
      ],
    };
    expect(extrairModelos("openai", corpo).map((m) => m.id)).toEqual(["gpt-4.1-mini", "gpt-5.6-luna"]);
  });

  it("Anthropic: usa o display_name como rótulo", () => {
    const corpo = { data: [{ id: "claude-haiku-4-5", display_name: "Claude Haiku 4.5" }] };
    expect(extrairModelos("anthropic", corpo)).toEqual([{ id: "claude-haiku-4-5", label: "Claude Haiku 4.5" }]);
  });

  it("Google: só quem gera conteúdo, sem o prefixo models/", () => {
    const corpo = {
      models: [
        { name: "models/gemini-2.0-flash", displayName: "Gemini 2.0 Flash", supportedGenerationMethods: ["generateContent"] },
        { name: "models/text-embedding-004", supportedGenerationMethods: ["embedContent"] },
        { name: "models/gemini-embedding-001", supportedGenerationMethods: ["generateContent"] },
      ],
    };
    expect(extrairModelos("google", corpo)).toEqual([{ id: "gemini-2.0-flash", label: "Gemini 2.0 Flash" }]);
  });

  it("corpo estranho não quebra", () => {
    expect(extrairModelos("groq", null)).toEqual([]);
    expect(extrairModelos("google", { models: "x" })).toEqual([]);
  });
});

describe("listarModelosDaChave", () => {
  it("manda a chave no cabeçalho certo de cada provedor", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ data: [], models: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await listarModelosDaChave("anthropic", "k1");
    await listarModelosDaChave("google", "k2");
    await listarModelosDaChave("xai", "k3");

    const chamadas = fetchMock.mock.calls as unknown as [string, RequestInit][];
    expect(chamadas[0][0]).toBe("https://api.anthropic.com/v1/models?limit=1000");
    expect(chamadas[0][1].headers).toMatchObject({ "x-api-key": "k1" });
    expect(chamadas[1][1].headers).toMatchObject({ "x-goog-api-key": "k2" });
    expect(chamadas[2][0]).toBe("https://api.x.ai/v1/models");
    expect(chamadas[2][1].headers).toMatchObject({ Authorization: "Bearer k3" });
  });

  it("chave recusada vira mensagem legível, sem vazar o corpo do provedor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("invalid key sk-123", { status: 401 })));
    const r = await listarModelosDaChave("openai", "ruim");
    expect(r.modelos).toEqual([]);
    expect(r.erro).toContain("recusada");
    expect(r.erro).not.toContain("sk-123");
  });

  it("provedor fora do ar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); }));
    const r = await listarModelosDaChave("groq", "k");
    expect(r.erro).toBeTruthy();
  });
});
