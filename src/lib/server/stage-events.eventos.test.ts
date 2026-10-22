import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  dealStageEvent: { createMany: vi.fn() },
  pipelineStage: { findMany: vi.fn() },
  $executeRaw: vi.fn(),
}));
const barramento = vi.hoisted(() => ({ publicarEvento: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/eventos/barramento", () => barramento);

import { registrarMudancaDeEtapa } from "./stage-events";

const base = { orgId: "o1", dealId: "d1", pipelineId: "p1" };
const tipos = (de: string, para: string) =>
  db.pipelineStage.findMany.mockResolvedValue([
    { id: "s1", type: de },
    { id: "s2", type: para },
  ]);
const emitidos = () => barramento.publicarEvento.mock.calls.map((c) => c[0].tipo);

beforeEach(() => vi.clearAllMocks());

describe("eventos da mudança de etapa", () => {
  it("negócio novo: deal.created", async () => {
    await registrarMudancaDeEtapa({ ...base, fromStageId: null, toStageId: "s2" });
    expect(emitidos()).toEqual(["deal.created"]);
  });

  it("aberta para ganho: stage_changed e won, com a etapa anterior", async () => {
    tipos("open", "won");
    await registrarMudancaDeEtapa({ ...base, fromStageId: "s1", toStageId: "s2" });
    expect(emitidos()).toEqual(["deal.stage_changed", "deal.won"]);
    expect(barramento.publicarEvento.mock.calls[1][0]).toMatchObject({
      orgId: "o1",
      objeto: "deal",
      objetoId: "d1",
      dados: { pipeline_id: "p1", from_stage_id: "s1", to_stage_id: "s2", previous: { stage_id: "s1" } },
    });
  });

  it("perdido para aberta: reopened", async () => {
    tipos("lost", "open");
    await registrarMudancaDeEtapa({ ...base, fromStageId: "s1", toStageId: "s2" });
    expect(emitidos()).toEqual(["deal.stage_changed", "deal.reopened"]);
  });

  it("mesma etapa: nada", async () => {
    await registrarMudancaDeEtapa({ ...base, fromStageId: "s1", toStageId: "s1" });
    expect(emitidos()).toEqual([]);
  });
});
