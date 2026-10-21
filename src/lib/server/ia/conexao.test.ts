import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  aiConnection: { findUnique: vi.fn(), upsert: vi.fn() },
  credential: { findMany: vi.fn() },
}));
const auto = vi.hoisted(() => ({ escolherProvedorDeIa: vi.fn() }));

vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/crypto", () => ({ decryptSecret: (s: string) => (s === "quebrada" ? (() => { throw new Error("x"); })() : `chave-${s}`) }));
vi.mock("@/lib/server/ia/provedor", () => auto);

import { lerConexao, normalizarPassos, normalizarTempo, passosDaConexao, salvarConexao } from "./conexao";

beforeEach(() => vi.clearAllMocks());

describe("normalizar", () => {
  it("passos: só com credencial e modelo, sem repetir, no máximo 6", () => {
    const bruto = [
      { credentialId: "a", model: "m1" },
      { credentialId: "a", model: "m1" },
      { credentialId: "", model: "m" },
      { credentialId: "b" },
      "lixo",
      ...Array.from({ length: 10 }, (_, i) => ({ credentialId: `c${i}`, model: "m" })),
    ];
    const r = normalizarPassos(bruto);
    expect(r).toHaveLength(6);
    expect(r[0]).toEqual({ credentialId: "a", model: "m1" });
    expect(normalizarPassos("x")).toEqual([]);
  });

  it("tempo entre 5 s e 120 s", () => {
    expect(normalizarTempo(1000)).toBe(5000);
    expect(normalizarTempo(999999)).toBe(120000);
    expect(normalizarTempo("abc")).toBe(25000);
  });
});

describe("lerConexao", () => {
  it("tabela ausente: não quebra, diz que não está disponível", async () => {
    db.aiConnection.findUnique.mockRejectedValue(new Error('relation "eva_studio_ai_connections" does not exist'));
    expect(await lerConexao("o1")).toEqual({ passos: [], timeoutMs: 25000, disponivel: false });
  });
});

describe("salvarConexao", () => {
  it("descarta credencial de outro contrato", async () => {
    db.credential.findMany.mockResolvedValue([{ id: "minha" }]);
    const r = await salvarConexao("o1", [{ credentialId: "minha", model: "m" }, { credentialId: "alheia", model: "m" }], 30000);
    expect(db.credential.findMany.mock.calls[0][0].where.orgId).toBe("o1");
    expect(r.passos).toEqual([{ credentialId: "minha", model: "m" }]);
    expect(db.aiConnection.upsert.mock.calls[0][0].update).toEqual({ passos: [{ credentialId: "minha", model: "m" }], timeoutMs: 30000 });
  });
});

describe("passosDaConexao", () => {
  it("na ordem salva, com a chave decifrada; pula credencial apagada ou quebrada", async () => {
    db.aiConnection.findUnique.mockResolvedValue({
      passos: [
        { credentialId: "g", model: "gemini-2.5-flash" },
        { credentialId: "sumiu", model: "x" },
        { credentialId: "q", model: "y" },
        { credentialId: "o", model: "gpt-5.6-luna" },
      ],
      timeoutMs: 20000,
    });
    db.credential.findMany.mockResolvedValue([
      { id: "o", name: "OpenAI", type: "openai", secretEnc: "o" },
      { id: "g", name: "Gemini", type: "google", secretEnc: "g" },
      { id: "q", name: "Quebrada", type: "groq", secretEnc: "quebrada" },
    ]);
    const r = await passosDaConexao("o1");
    expect(r.timeoutMs).toBe(20000);
    expect(r.passos).toEqual([
      { provider: "google", apiKey: "chave-g", model: "gemini-2.5-flash", origem: "Gemini" },
      { provider: "openai", apiKey: "chave-o", model: "gpt-5.6-luna", origem: "OpenAI" },
    ]);
    expect(auto.escolherProvedorDeIa).not.toHaveBeenCalled();
  });

  it("sem conexão salva (ou sem tabela): usa a escolha automática", async () => {
    db.aiConnection.findUnique.mockRejectedValue(new Error("no table"));
    auto.escolherProvedorDeIa.mockResolvedValue({ provider: "groq", apiKey: "p", model: "llama", origem: "plataforma" });
    const r = await passosDaConexao("o1");
    expect(r.passos).toEqual([{ provider: "groq", apiKey: "p", model: "llama", origem: "plataforma" }]);
  });

  it("nada configurado em lugar nenhum: lista vazia", async () => {
    db.aiConnection.findUnique.mockResolvedValue(null);
    auto.escolherProvedorDeIa.mockResolvedValue(null);
    expect((await passosDaConexao("o1")).passos).toEqual([]);
  });
});
