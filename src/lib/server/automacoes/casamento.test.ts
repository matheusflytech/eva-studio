import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EventoPublicado } from "@/lib/server/eventos/barramento";

const db = vi.hoisted(() => ({
  automacao: { findMany: vi.fn() },
  automacaoExecucao: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
  automacaoEspera: { findMany: vi.fn(), deleteMany: vi.fn() },
  deal: { findMany: vi.fn() },
  task: { findFirst: vi.fn() },
}));
const executor = vi.hoisted(() => ({ executarExecucao: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("./executor", () => executor);
vi.mock("@/lib/server/eventos/alteracoes", () => ({ fotoDoRegistro: vi.fn(async () => ({ id: "d1", pipeline_id: "p1" })) }));

import { paraAutomacoes, PROFUNDIDADE_MAXIMA } from "./casamento";
import { inscrever } from "./inscricao";

const automacao = (over: Record<string, unknown> = {}) => ({
  id: "a1",
  orgId: "o1",
  objeto: "deal",
  versaoPublicadaId: "v1",
  reinscricao: "sempre",
  reinscricaoHoras: null,
  versaoPublicada: { definicao: { objeto: "deal", gatilho: { tipo: "deal.stage_entered", config: { etapa: "s1" } }, inicio: null, nos: {} } },
  ...over,
});

const evento = (over: Partial<EventoPublicado> = {}): EventoPublicado => ({
  id: "ev1",
  orgId: "o1",
  tipo: "deal.stage_changed",
  objeto: "deal",
  objetoId: "d1",
  dados: { from_stage_id: "s0", to_stage_id: "s1" },
  ator: { tipo: "usuario" },
  criadoEm: new Date(),
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.automacao.findMany.mockResolvedValue([automacao()]);
  db.automacaoExecucao.findMany.mockResolvedValue([]);
  db.automacaoExecucao.create.mockResolvedValue({ id: "x1" });
  db.automacaoEspera.findMany.mockResolvedValue([]);
  db.deal.findMany.mockResolvedValue([]);
  executor.executarExecucao.mockResolvedValue(null);
});

describe("consumidor das automações", () => {
  it("evento que casa: inscreve e roda na hora", async () => {
    await paraAutomacoes(evento());
    const data = db.automacaoExecucao.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ automacaoId: "a1", versaoId: "v1", objetoId: "d1", eventoId: "ev1", status: "pendente", profundidade: 0 });
    expect(data.gatilho).toMatchObject({ tipo: "deal.stage_changed", to_stage_id: "s1" });
    expect(executor.executarExecucao).toHaveBeenCalledWith("x1");
  });

  it("evento que não casa: nada", async () => {
    await paraAutomacoes(evento({ dados: { to_stage_id: "s9" } }));
    expect(db.automacaoExecucao.create).not.toHaveBeenCalled();
  });

  it("a automação não dispara a si mesma", async () => {
    await paraAutomacoes(evento({ ator: { tipo: "automacao", automacaoId: "a1", profundidade: 1 } }));
    expect(db.automacaoExecucao.create).not.toHaveBeenCalled();
  });

  it(`cadeia de ${PROFUNDIDADE_MAXIMA} automações: registra "Loop detectado" e não roda`, async () => {
    await paraAutomacoes(evento({ ator: { tipo: "automacao", automacaoId: "outra", profundidade: PROFUNDIDADE_MAXIMA } }));
    const data = db.automacaoExecucao.create.mock.calls[0][0].data;
    expect(data.status).toBe("cancelada");
    expect(data.erro).toMatch(/Loop detectado/);
    expect(executor.executarExecucao).not.toHaveBeenCalled();
  });

  it("cadeia menor: inscreve com a profundidade herdada", async () => {
    await paraAutomacoes(evento({ ator: { tipo: "automacao", automacaoId: "outra", profundidade: 2 } }));
    expect(db.automacaoExecucao.create.mock.calls[0][0].data).toMatchObject({ status: "pendente", profundidade: 2 });
  });

  it("acorda quem esperava o evento no registro (inclusive negócios do contato)", async () => {
    db.automacao.findMany.mockResolvedValue([]);
    db.deal.findMany.mockResolvedValue([{ id: "d7" }]);
    db.automacaoEspera.findMany.mockResolvedValue([{ id: "w1", execucaoId: "x9", noId: "esp" }]);
    db.automacaoExecucao.findUnique.mockResolvedValue({ status: "esperando", variaveis: { __espera: { noId: "esp", ate: "2026-10-30T00:00:00Z" } } });
    db.automacaoEspera.deleteMany.mockResolvedValue({ count: 1 });
    await paraAutomacoes(evento({ tipo: "message.received", objeto: "conversation", objetoId: "cv1", dados: { contact_id: "c1", text: "oi" } }));
    const onde = db.automacaoEspera.findMany.mock.calls[0][0].where;
    expect(onde.OR).toEqual([
      { objeto: "conversation", objetoId: "cv1" },
      { objeto: "contact", objetoId: "c1" },
      { objeto: "deal", objetoId: "d7" },
    ]);
    const v = db.automacaoExecucao.update.mock.calls[0][0].data.variaveis;
    expect(v.__espera).toMatchObject({ noId: "esp", resultado: "aconteceu", evento: { tipo: "message.received", text: "oi" } });
    expect(executor.executarExecucao).toHaveBeenCalledWith("x9");
  });

  it("sem as tabelas: não faz nada nem quebra", async () => {
    db.automacao.findMany.mockRejectedValue(new Error("relation does not exist"));
    await expect(paraAutomacoes(evento())).resolves.toBeUndefined();
  });
});

describe("inscrição", () => {
  const a = { id: "a1", orgId: "o1", objeto: "deal", versaoPublicadaId: "v1", reinscricao: "uma_vez", reinscricaoHoras: null };

  it("uma vez: quem já passou não entra de novo", async () => {
    db.automacaoExecucao.findMany.mockResolvedValue([{ status: "concluida", createdAt: new Date() }]);
    expect(await inscrever(a, "d1", { origem: "e2" })).toEqual({ inscrita: false, motivo: "já passou por esta automação" });
  });

  it("sempre: entra de novo, mas não com uma execução viva", async () => {
    db.automacaoExecucao.findMany.mockResolvedValue([{ status: "esperando", createdAt: new Date() }]);
    expect(await inscrever({ ...a, reinscricao: "sempre" }, "d1", { origem: "e2" })).toMatchObject({ inscrita: false });
    db.automacaoExecucao.findMany.mockResolvedValue([{ status: "concluida", createdAt: new Date() }]);
    expect(await inscrever({ ...a, reinscricao: "sempre" }, "d1", { origem: "e2" })).toEqual({ inscrita: true, execucaoId: "x1" });
  });

  it("intervalo em horas e intervalo do gatilho", async () => {
    db.automacaoExecucao.findMany.mockResolvedValue([{ status: "concluida", createdAt: new Date(Date.now() - 3_600_000) }]);
    expect(await inscrever({ ...a, reinscricao: "intervalo", reinscricaoHoras: 24 }, "d1", { origem: "e2" })).toMatchObject({ inscrita: false });
    expect(await inscrever({ ...a, reinscricao: "sempre" }, "d1", { origem: "e2", intervaloMin: 120 })).toMatchObject({ inscrita: false, motivo: "intervalo do gatilho" });
  });

  it("mesmo evento duas vezes (chave única): a segunda não inscreve", async () => {
    db.automacaoExecucao.create.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    expect(await inscrever({ ...a, reinscricao: "sempre" }, "d1", { origem: "e1" })).toEqual({ inscrita: false, motivo: "este evento já inscreveu" });
  });

  it("sem versão publicada: não inscreve", async () => {
    expect(await inscrever({ ...a, versaoPublicadaId: null }, "d1", { origem: "e1" })).toMatchObject({ inscrita: false });
  });
});
