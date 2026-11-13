import { describe, it, expect, vi } from "vitest";
import { cacheSimples, criarMemoriaDeEnviadas, mensagemParaReenvio } from "./retentativa.js";

describe("criarMemoriaDeEnviadas", () => {
  it("guarda só as nossas e respeita o limite", () => {
    const m = criarMemoriaDeEnviadas(2);
    m.lembrar({ key: { id: "a", fromMe: true }, message: { conversation: "1" } });
    m.lembrar({ key: { id: "x", fromMe: false }, message: { conversation: "dele" } });
    m.lembrar({ key: { id: "b", fromMe: true }, message: { conversation: "2" } });
    m.lembrar({ key: { id: "c", fromMe: true }, message: { conversation: "3" } });
    expect(m.pegar("a")).toBeUndefined();
    expect(m.pegar("x")).toBeUndefined();
    expect(m.pegar("c")).toEqual({ conversation: "3" });
  });
});

describe("mensagemParaReenvio", () => {
  it("usa a memória primeiro", async () => {
    const m = criarMemoriaDeEnviadas();
    m.lembrar({ key: { id: "a", fromMe: true }, message: { imageMessage: {} } });
    const query = vi.fn();
    expect(await mensagemParaReenvio({ query }, m, { id: "a" })).toEqual({ imageMessage: {} });
    expect(query).not.toHaveBeenCalled();
  });
  it("depois de reiniciar, busca o texto na fila pelo id do WhatsApp", async () => {
    const query = vi.fn(async () => ({ rows: [{ text: "Olá, Maria," }] }));
    expect(await mensagemParaReenvio({ query }, criarMemoriaDeEnviadas(), { id: "z" })).toEqual({ conversation: "Olá, Maria," });
    expect(query.mock.calls[0]).toEqual([expect.stringContaining('"externalId" = $1'), ["z"]]);
  });
  it("não achou: undefined", async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    expect(await mensagemParaReenvio({ query }, criarMemoriaDeEnviadas(), { id: "z" })).toBeUndefined();
  });
});

describe("cacheSimples", () => {
  it("get/set/del", () => {
    const c = cacheSimples();
    c.set("k", 1);
    expect(c.get("k")).toBe(1);
    c.del("k");
    expect(c.get("k")).toBeUndefined();
  });
});
