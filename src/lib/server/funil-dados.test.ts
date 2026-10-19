import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  pipeline: { findFirst: vi.fn() },
  pipelineStage: { findMany: vi.fn() },
  deal: { findMany: vi.fn() },
  dealStageEvent: { findMany: vi.fn(), findFirst: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { coletarFunil } from "./funil-dados";

const D = (s: string) => new Date(`2026-10-${s}T12:00:00Z`);

beforeEach(() => {
  vi.clearAllMocks();
  db.pipeline.findFirst.mockResolvedValue({ id: "p1" });
  db.pipelineStage.findMany.mockResolvedValue([
    { id: "lead", name: "Lead", position: 0, type: "open" },
    { id: "prop", name: "Proposta", position: 1, type: "open" },
    { id: "ganho", name: "Ganho", position: 2, type: "won" },
    { id: "perdido", name: "Perdido", position: 3, type: "lost" },
  ]);
  db.deal.findMany.mockResolvedValue([
    { id: "a", name: "A", stageId: "prop", createdAt: D("01"), closedAt: null, stageSince: D("02"), amountCents: 1000, lostReason: "" },
    { id: "b", name: "B", stageId: "ganho", createdAt: D("01"), closedAt: D("05"), stageSince: D("05"), amountCents: 5000, lostReason: "" },
  ]);
  db.dealStageEvent.findMany.mockResolvedValue([
    { dealId: "a", fromStageId: null, toStageId: "lead", at: D("01") },
    { dealId: "a", fromStageId: "lead", toStageId: "prop", at: D("02") },
    { dealId: "b", fromStageId: null, toStageId: "lead", at: D("01") },
    { dealId: "b", fromStageId: "lead", toStageId: "ganho", at: D("05") },
  ]);
  db.dealStageEvent.findFirst.mockResolvedValue({ at: D("01") });
});

describe("coletarFunil", () => {
  it("monta todas as fontes do funil a partir do funil padrão da organização", async () => {
    const r = await coletarFunil("o1", D("01"), D("15"));
    expect(db.pipeline.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: "o1" } }));
    expect(db.deal.findMany.mock.calls[0][0].where).toMatchObject({ orgId: "o1", pipelineId: "p1", archivedAt: null });
    expect(r.funis.funilConversao.map((l) => [l.nome, l.quantidade])).toEqual([["Lead", 2], ["Proposta", 2], ["Ganho", 1]]);
    expect(r.numeros.taxaDeGanho).toBe(1);
    expect(r.numeros.cicloDeVenda).toBe(4);
    expect(r.quebras.tempoPorEtapa.map((p) => p.label)).toEqual(["Lead", "Proposta"]);
    expect(r.tabelas.negociosParados.map((l) => [l.titulo, l.etapa])).toEqual([["A", "Proposta"]]);
    expect(r.historicoDesde).toEqual(D("01"));
  });

  it("o aviso de histórico conta só registros reais, não os do backfill", async () => {
    await coletarFunil("o1", D("01"), D("15"));
    expect(db.dealStageEvent.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { orgId: "o1", origem: { not: "backfill" } } })
    );
  });

  it("funil escolhido: busca esse, sempre dentro da organização", async () => {
    await coletarFunil("o1", D("01"), D("15"), "p9");
    expect(db.pipeline.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { orgId: "o1", id: "p9" } }));
  });

  it("organização sem funil: tudo vazio, sem erro", async () => {
    db.pipeline.findFirst.mockResolvedValue(null);
    const r = await coletarFunil("o1", D("01"), D("15"));
    expect(r.funis.funilConversao).toEqual([]);
    expect(r.numeros.taxaDeGanho).toBeNull();
    expect(db.deal.findMany).not.toHaveBeenCalled();
  });

  it("tabela de histórico ainda não criada: usa só a etapa atual, sem derrubar o dashboard", async () => {
    db.dealStageEvent.findMany.mockRejectedValue(new Error('relation "eva_studio_deal_stage_events" does not exist'));
    db.dealStageEvent.findFirst.mockRejectedValue(new Error("idem"));
    const r = await coletarFunil("o1", D("01"), D("15"));
    expect(r.funis.funilConversao.map((l) => l.quantidade)).toEqual([2, 2, 1]);
    expect(r.historicoDesde).toBeNull();
  });
});
