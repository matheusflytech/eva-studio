import { describe, it, expect, vi } from "vitest";
import { chamarComReserva, ehErroDeReserva, type PassoDeIa } from "./reserva";
import type { CallLlmOptions, LlmResult } from "@/lib/server/llm";

vi.mock("@/lib/server/llm", () => ({ callLlmWithTools: vi.fn() }));

const passo = (origem: string, provider: PassoDeIa["provider"] = "openai"): PassoDeIa => ({
  provider,
  apiKey: `k-${origem}`,
  model: `m-${origem}`,
  origem,
});
const base = { systemPrompt: "", userMessage: "oi", tools: [], executeTool: vi.fn(async () => "ok") };

describe("ehErroDeReserva", () => {
  it("falha do provedor vale reserva; recusa e estouro de rodadas, não", () => {
    expect(ehErroDeReserva("openai 429: rate limit")).toBe(true);
    expect(ehErroDeReserva("anthropic 529: overloaded")).toBe(true);
    expect(ehErroDeReserva("The operation was aborted due to timeout")).toBe(true);
    expect(ehErroDeReserva("Pedido recusado pelo modelo (cyber).")).toBe(false);
    expect(ehErroDeReserva("Excedeu o limite de rodadas de ferramenta sem resposta final.")).toBe(false);
  });
});

describe("chamarComReserva", () => {
  it("primeiro passo responde: usa ele e não tenta mais nada", async () => {
    const chamar = vi.fn(async (): Promise<LlmResult> => ({ text: "oi" }));
    const r = await chamarComReserva([passo("A"), passo("B")], base, chamar);
    expect(r.text).toBe("oi");
    expect(r.usado?.origem).toBe("A");
    expect(chamar).toHaveBeenCalledTimes(1);
  });

  it("primeiro falha (limite): passa para o segundo com a chave e o modelo dele", async () => {
    const chamar = vi.fn(async (o: CallLlmOptions): Promise<LlmResult> =>
      o.apiKey === "k-A" ? { text: null, error: "openai 429: limite" } : { text: "da reserva" }
    );
    const r = await chamarComReserva([passo("A"), passo("B", "google")], base, chamar);
    expect(r.text).toBe("da reserva");
    expect(r.usado?.origem).toBe("B");
    expect(r.tentativas).toEqual([{ origem: "A", model: "m-A", error: "openai 429: limite" }]);
    expect(chamar.mock.calls[1][0]).toMatchObject({ provider: "google", apiKey: "k-B", model: "m-B" });
  });

  it("resposta vazia também conta como falha", async () => {
    const chamar = vi.fn(async (o: CallLlmOptions): Promise<LlmResult> => (o.apiKey === "k-A" ? { text: null } : { text: "ok" }));
    expect((await chamarComReserva([passo("A"), passo("B")], base, chamar)).text).toBe("ok");
  });

  it("todos falham: devolve o erro do último", async () => {
    const chamar = vi.fn(async (o: CallLlmOptions): Promise<LlmResult> => ({ text: null, error: `erro ${o.apiKey}` }));
    const r = await chamarComReserva([passo("A"), passo("B")], base, chamar);
    expect(r.error).toBe("erro k-B");
    expect(r.tentativas).toHaveLength(1);
  });

  it("falhou depois de executar ferramenta: não repete (evita criar o negócio duas vezes)", async () => {
    const chamar = vi.fn(async (o: CallLlmOptions): Promise<LlmResult> => {
      await o.executeTool({ id: "1", name: "crm_criar_negocio", arguments: {} });
      return { text: null, error: "openai 500: caiu" };
    });
    const r = await chamarComReserva([passo("A"), passo("B")], base, chamar);
    expect(chamar).toHaveBeenCalledTimes(1);
    expect(r.error).toContain("500");
    expect(r.executouFerramenta).toBe(true);
    expect(base.executeTool).toHaveBeenCalledTimes(1);
  });

  it("recusa do modelo: não tenta outro", async () => {
    const chamar = vi.fn(async (): Promise<LlmResult> => ({ text: null, error: "Pedido recusado pelo modelo (x)." }));
    await chamarComReserva([passo("A"), passo("B")], base, chamar);
    expect(chamar).toHaveBeenCalledTimes(1);
  });

  it("sem passos: erro claro", async () => {
    expect((await chamarComReserva([], base, vi.fn())).error).toMatch(/Nenhuma chave/);
  });
});
