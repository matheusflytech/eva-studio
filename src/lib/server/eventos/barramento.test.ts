import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  eventoDeDominio: { create: vi.fn(), updateMany: vi.fn(), findMany: vi.fn() },
}));
const consumidor = vi.hoisted(() => ({ paraWebhooks: vi.fn() }));
const depois = vi.hoisted(() => ({ fila: [] as (() => Promise<void>)[] }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/webhooks/do-barramento", () => consumidor);
// `after` guarda o callback; o teste decide quando rodar (como o fim da resposta).
vi.mock("next/server", () => ({ after: (fn: () => Promise<void>) => depois.fila.push(fn) }));

import { atorAtual, comAtor, entregarEvento, entregarEventosPendentes, publicarEvento } from "./barramento";

const rodarDepois = async () => {
  while (depois.fila.length) await depois.fila.shift()!();
};

beforeEach(() => {
  vi.clearAllMocks();
  depois.fila = [];
  db.eventoDeDominio.create.mockResolvedValue({ id: "ev1", createdAt: new Date("2026-10-21T12:00:00Z") });
  db.eventoDeDominio.updateMany.mockResolvedValue({ count: 1 });
});

describe("publicarEvento", () => {
  it("grava o evento e entrega depois da resposta, uma vez", async () => {
    await publicarEvento({ orgId: "o1", tipo: "contact.tag_added", objeto: "contact", objetoId: "c1", dados: { tag_id: "t1" } });
    expect(db.eventoDeDominio.create.mock.calls[0][0].data).toMatchObject({ orgId: "o1", tipo: "contact.tag_added", objetoId: "c1", dados: { tag_id: "t1" }, ator: { tipo: "sistema" } });
    expect(consumidor.paraWebhooks).not.toHaveBeenCalled();
    await rodarDepois();
    expect(db.eventoDeDominio.updateMany).toHaveBeenCalledWith({ where: { id: "ev1", processadoEm: null }, data: { processadoEm: expect.any(Date) } });
    expect(consumidor.paraWebhooks).toHaveBeenCalledWith(expect.objectContaining({ id: "ev1", tipo: "contact.tag_added", dados: { tag_id: "t1" } }));
  });

  it("outro já entregou (relógio): não entrega de novo", async () => {
    db.eventoDeDominio.updateMany.mockResolvedValue({ count: 0 });
    await publicarEvento({ orgId: "o1", tipo: "deal.won", objeto: "deal", objetoId: "d1" });
    await rodarDepois();
    expect(consumidor.paraWebhooks).not.toHaveBeenCalled();
  });

  it("sem a tabela: entrega direto, como antes do barramento", async () => {
    db.eventoDeDominio.create.mockRejectedValue(new Error('relation "eva_studio_eventos" does not exist'));
    await publicarEvento({ orgId: "o1", tipo: "deal.won", objeto: "deal", objetoId: "d1" });
    await rodarDepois();
    expect(db.eventoDeDominio.updateMany).not.toHaveBeenCalled();
    expect(consumidor.paraWebhooks).toHaveBeenCalledWith(expect.objectContaining({ id: null, tipo: "deal.won" }));
  });

  it("consumidor que falha não derruba quem publicou", async () => {
    consumidor.paraWebhooks.mockRejectedValue(new Error("caiu"));
    await expect(publicarEvento({ orgId: "o1", tipo: "deal.won", objeto: "deal", objetoId: "d1" })).resolves.toBeUndefined();
    await expect(rodarDepois()).resolves.toBeUndefined();
  });

  it("ator vem do contexto (comAtor) e vale dentro de chamadas aninhadas", async () => {
    expect(atorAtual()).toEqual({ tipo: "sistema" });
    await comAtor({ tipo: "automacao", automacaoId: "a1", execucaoId: "x1", profundidade: 1 }, async () => {
      await Promise.resolve();
      await publicarEvento({ orgId: "o1", tipo: "deal.updated", objeto: "deal", objetoId: "d1", diff: { name: { de: "A", para: "B" } } });
    });
    expect(db.eventoDeDominio.create.mock.calls[0][0].data).toMatchObject({
      ator: { tipo: "automacao", automacaoId: "a1", execucaoId: "x1", profundidade: 1 },
      diff: { name: { de: "A", para: "B" } },
    });
    expect(atorAtual()).toEqual({ tipo: "sistema" });
  });
});

describe("eventos pendentes (relógio)", () => {
  it("entrega os que ficaram para trás há mais de 1 minuto", async () => {
    db.eventoDeDominio.findMany.mockResolvedValue([
      { id: "e1", orgId: "o1", tipo: "deal.won", objeto: "deal", objetoId: "d1", dados: {}, diff: null, ator: { tipo: "api" }, createdAt: new Date() },
    ]);
    const r = await entregarEventosPendentes();
    expect(r.entregues).toBe(1);
    const onde = db.eventoDeDominio.findMany.mock.calls[0][0].where;
    expect(onde.processadoEm).toBeNull();
    expect(Date.now() - onde.createdAt.lt.getTime()).toBeGreaterThanOrEqual(60_000);
    expect(consumidor.paraWebhooks).toHaveBeenCalledWith(expect.objectContaining({ id: "e1", ator: { tipo: "api" } }));
  });

  it("sem a tabela: nada", async () => {
    db.eventoDeDominio.findMany.mockRejectedValue(new Error("does not exist"));
    expect(await entregarEventosPendentes()).toEqual({ entregues: 0 });
  });

  it("entregarEvento sem id (sem tabela) não tenta marcar", async () => {
    await entregarEvento({ id: null, orgId: "o1", tipo: "x", objeto: "deal", objetoId: "d1", dados: {}, ator: { tipo: "sistema" }, criadoEm: new Date() });
    expect(db.eventoDeDominio.updateMany).not.toHaveBeenCalled();
    expect(consumidor.paraWebhooks).toHaveBeenCalledTimes(1);
  });
});
