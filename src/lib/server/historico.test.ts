import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  historico: { create: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
  profile: { findUnique: vi.fn() },
  agent: { findFirst: vi.fn() },
  automacao: { findFirst: vi.fn() },
  apiKey: { findFirst: vi.fn() },
  deal: { findFirst: vi.fn() },
  contact: { findFirst: vi.fn() },
  company: { findFirst: vi.fn() },
}));
const cab = vi.hoisted(() => ({ atual: {} as object | null }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("next/headers", () => ({
  headers: async () => {
    if (!cab.atual) throw new Error("fora de requisição");
    return cab.atual;
  },
}));
vi.mock("next/server", () => ({ after: () => {} }));
vi.mock("@/lib/server/webhooks/do-barramento", () => ({ paraWebhooks: vi.fn() }));
vi.mock("@/lib/server/automacoes/casamento", () => ({ paraAutomacoes: vi.fn() }));

import { limparHistoricoVencido, listarHistorico, registrarHistorico, LIMITE_DE_TEXTO } from "./historico";
import { atorDaRequisicao, marcarPessoaDaRequisicao } from "./eventos/ator-da-requisicao";
import { comAtor } from "./eventos/barramento";

beforeEach(() => {
  vi.clearAllMocks();
  cab.atual = {};
  db.historico.create.mockResolvedValue({ id: "h1" });
  db.profile.findUnique.mockResolvedValue({ name: "Ana Souza" });
  db.deal.findFirst.mockResolvedValue({ name: "Acme" });
});

const gravado = () => db.historico.create.mock.calls[0][0].data;

describe("registrarHistorico", () => {
  it("pessoa da requisição: grava o id e o nome dela", async () => {
    await marcarPessoaDaRequisicao("u1");
    await registrarHistorico({ orgId: "o1", acao: "alterou", objeto: "deal", objetoId: "d1", objetoNome: "Acme", mudancas: { name: { de: "A", para: "B" } } });
    expect(gravado()).toMatchObject({ orgId: "o1", acao: "alterou", objeto: "deal", objetoId: "d1", objetoNome: "Acme", atorTipo: "usuario", atorId: "u1", atorNome: "Ana Souza" });
    expect(db.profile.findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: { name: true } });
  });

  it("comAtor vale mais que a pessoa da requisição; nome da automação", async () => {
    await marcarPessoaDaRequisicao("u1");
    db.automacao.findFirst.mockResolvedValue({ nome: "Boas-vindas" });
    await comAtor({ tipo: "automacao", id: "a1", automacaoId: "a1" }, () =>
      registrarHistorico({ orgId: "o1", acao: "alterou", objeto: "deal", objetoId: "d1", objetoNome: "Acme", mudancas: {} })
    );
    expect(gravado()).toMatchObject({ atorTipo: "automacao", atorId: "a1", atorNome: "Boas-vindas" });
  });

  it("sem ninguém: sistema", async () => {
    cab.atual = null;
    await registrarHistorico({ orgId: "o1", acao: "criou", objeto: "deal", objetoId: "d1", objetoNome: "Acme" });
    expect(gravado()).toMatchObject({ atorTipo: "sistema", atorId: null, atorNome: "Sistema" });
  });

  it("corta textos longos, inclusive em campo personalizado", async () => {
    const longo = "x".repeat(LIMITE_DE_TEXTO + 50);
    await registrarHistorico({
      orgId: "o1",
      acao: "alterou",
      objeto: "deal",
      objetoId: "d1",
      objetoNome: "Acme",
      mudancas: { description: { de: null, para: longo }, "custom_fields.obs": { de: longo, para: "ok" } },
    });
    const m = gravado().mudancas;
    expect(m.description.para).toHaveLength(LIMITE_DE_TEXTO + 1);
    expect(m.description.para.endsWith("…")).toBe(true);
    expect(m["custom_fields.obs"].de).toHaveLength(LIMITE_DE_TEXTO + 1);
    expect(m["custom_fields.obs"].para).toBe("ok");
  });

  it("teste de automação não grava", async () => {
    await registrarHistorico({ orgId: "o1", acao: "criou", objeto: "deal", objetoId: "d1", objetoNome: "x" }, { tipo: "automacao", teste: true });
    expect(db.historico.create).not.toHaveBeenCalled();
  });

  it("sem objetoNome: busca o nome do registro", async () => {
    await registrarHistorico({ orgId: "o1", acao: "criou", objeto: "deal", objetoId: "d1" });
    expect(db.deal.findFirst).toHaveBeenCalledWith({ where: { id: "d1", orgId: "o1" }, select: { name: true } });
    expect(gravado().objetoNome).toBe("Acme");
  });

  it("falha ao gravar não propaga; sem a tabela nem loga", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    db.historico.create.mockRejectedValueOnce(new Error("caiu"));
    await expect(registrarHistorico({ orgId: "o1", acao: "criou", objeto: "deal", objetoId: "d1", objetoNome: "x" })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalledTimes(1);
    db.historico.create.mockRejectedValueOnce(new Error('relation "eva_studio_historico" does not exist'));
    await registrarHistorico({ orgId: "o1", acao: "criou", objeto: "deal", objetoId: "d1", objetoNome: "x" });
    expect(log).toHaveBeenCalledTimes(1);
    log.mockRestore();
  });
});

describe("pessoa da requisição", () => {
  it("vale só para a mesma requisição; fora de requisição, ninguém", async () => {
    const r1 = {};
    cab.atual = r1;
    await marcarPessoaDaRequisicao("u1");
    expect(await atorDaRequisicao()).toEqual({ tipo: "usuario", id: "u1" });
    cab.atual = {};
    expect(await atorDaRequisicao()).toBeNull();
    cab.atual = null;
    await marcarPessoaDaRequisicao("u2");
    expect(await atorDaRequisicao()).toBeNull();
  });
});

describe("listarHistorico", () => {
  const linha = (id: string, iso: string) => ({
    id,
    orgId: "o1",
    acao: "alterou",
    objeto: "deal",
    objetoId: "d1",
    objetoNome: "Acme",
    mudancas: null,
    detalhes: {},
    atorTipo: "usuario",
    atorId: "u1",
    atorNome: "Ana",
    createdAt: new Date(iso),
  });

  it("filtros, cursor e página seguinte", async () => {
    db.historico.findMany.mockResolvedValue([linha("h3", "2026-10-23T10:00:00Z"), linha("h2", "2026-10-23T09:00:00Z"), linha("h1", "2026-10-23T08:00:00Z")]);
    const r = await listarHistorico("o1", {
      objeto: "deal",
      objetoId: "d1",
      acoes: ["alterou"],
      atorId: "u1",
      de: new Date("2026-10-01T00:00:00Z"),
      ate: new Date("2026-10-31T00:00:00Z"),
      busca: "acm",
      limite: 2,
      cursor: "2026-10-24T00:00:00.000Z|hx",
    });
    const q = db.historico.findMany.mock.calls[0][0];
    expect(q.take).toBe(3);
    expect(q.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
    expect(q.where).toMatchObject({
      orgId: "o1",
      objeto: "deal",
      objetoId: "d1",
      acao: { in: ["alterou"] },
      atorId: "u1",
      objetoNome: { contains: "acm", mode: "insensitive" },
    });
    expect(q.where.AND).toEqual([
      { createdAt: { gte: new Date("2026-10-01T00:00:00Z"), lte: new Date("2026-10-31T00:00:00Z") } },
      {
        OR: [
          { createdAt: { lt: new Date("2026-10-24T00:00:00.000Z") } },
          { createdAt: new Date("2026-10-24T00:00:00.000Z"), id: { lt: "hx" } },
        ],
      },
    ]);
    expect(r.disponivel).toBe(true);
    expect(r.linhas.map((l) => l.id)).toEqual(["h3", "h2"]);
    expect(r.linhas[0].em).toBe("2026-10-23T10:00:00.000Z");
    expect(r.proximo).toBe("2026-10-23T09:00:00.000Z|h2");
  });

  it("sem a tabela: indisponível, lista vazia", async () => {
    db.historico.findMany.mockRejectedValue(new Error('relation "eva_studio_historico" does not exist'));
    expect(await listarHistorico("o1", {})).toEqual({ disponivel: false, linhas: [], proximo: null });
  });
});

describe("limpeza", () => {
  it("apaga o que passou de 2 anos", async () => {
    db.historico.deleteMany.mockResolvedValue({ count: 3 });
    const agora = new Date("2026-10-23T12:00:00Z");
    expect(await limparHistoricoVencido(agora)).toBe(3);
    const corte = db.historico.deleteMany.mock.calls[0][0].where.createdAt.lt as Date;
    expect(agora.getTime() - corte.getTime()).toBe(730 * 86_400_000);
  });
});
