import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  dealStageEvent: { findMany: vi.fn() },
  pipelineStage: { findMany: vi.fn() },
  contact: { findMany: vi.fn() },
  task: { findMany: vi.fn() },
  deal: { findMany: vi.fn() },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("./negocios", () => ({ INCLUDE_NEGOCIO: {}, serializarNegocios: async (_o: string, l: { id: string }[]) => l.map((d) => ({ id: d.id, obj: "deal" })) }));
vi.mock("./contatos", () => ({ INCLUDE_CONTATO: {}, serializarContatos: async (_o: string, l: { id: string }[]) => l.map((c) => ({ id: c.id, obj: "contact" })) }));
vi.mock("./tarefas-notas", () => ({ serializarTarefa: (t: { id: string }) => ({ id: t.id, obj: "task" }) }));

import { codificarCursor, lerCursor, lerTipos, listarEventos } from "./eventos";

const agora = new Date("2026-10-21T12:00:00Z");
const t = (min: number) => new Date(agora.getTime() - min * 60_000);

beforeEach(() => {
  vi.clearAllMocks();
  db.dealStageEvent.findMany.mockResolvedValue([
    { id: "e1", dealId: "d1", fromStageId: null, toStageId: "s1", at: t(30) },
    { id: "e2", dealId: "d1", fromStageId: "s1", toStageId: "s9", at: t(10) },
  ]);
  db.pipelineStage.findMany.mockResolvedValue([{ id: "s1", type: "open", numero: 1 }, { id: "s9", type: "won", numero: 9 }]);
  db.contact.findMany.mockImplementation(async (q: { where: Record<string, unknown>; include?: unknown }) =>
    q.include ? [{ id: "c1" }] : "createdAt" in q.where ? [{ id: "c1", createdAt: t(20) }] : []
  );
  db.task.findMany.mockResolvedValue([]);
  db.deal.findMany.mockResolvedValue([{ id: "d1" }]);
});

describe("listarEventos", () => {
  it("monta do histórico, em ordem, com ganho derivado do tipo da etapa e o objeto atual", async () => {
    const r = await listarEventos("o1", { tipos: ["*"], cursor: null, limite: 50, agora });
    expect(r.data.map((e) => e.type)).toEqual(["deal.created", "contact.created", "deal.stage_changed", "deal.won"]);
    expect(r.data[3]).toMatchObject({ data: { id: "d1", obj: "deal" }, previous: { stage_id: 1 } });
    expect(r.has_more).toBe(false);
    expect(lerCursor(r.next_cursor)).toEqual({ t: t(10).toISOString(), k: "dse:e2:2" });
  });

  it("filtro por tipo e paginação estrita pelo cursor", async () => {
    const p1 = await listarEventos("o1", { tipos: ["deal.*"], cursor: null, limite: 2, agora });
    expect(p1.data.map((e) => e.type)).toEqual(["deal.created", "deal.stage_changed"]);
    expect(p1.has_more).toBe(true);
    expect(db.contact.findMany).not.toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ createdAt: expect.anything() }) }));
    const p2 = await listarEventos("o1", { tipos: ["deal.*"], cursor: lerCursor(p1.next_cursor), limite: 2, agora });
    expect(p2.data.map((e) => e.type)).toEqual(["deal.won"]);
  });

  it("since mais velho que 30 dias vira 30 dias; sem novidade devolve o mesmo cursor", async () => {
    db.dealStageEvent.findMany.mockResolvedValue([]);
    db.contact.findMany.mockResolvedValue([]);
    const c = { t: t(5).toISOString(), k: "x" };
    const r = await listarEventos("o1", { tipos: ["deal.*"], desde: new Date("2020-01-01"), cursor: c, limite: 10, agora });
    expect(r.data).toEqual([]);
    expect(r.next_cursor).toBe(codificarCursor(c));
    const r2 = await listarEventos("o1", { tipos: ["deal.*"], desde: new Date("2020-01-01"), cursor: null, limite: 10, agora });
    expect(r2.next_cursor).toBeNull();
    const gte = db.dealStageEvent.findMany.mock.calls.at(-1)![0].where.at.gte as Date;
    expect(agora.getTime() - gte.getTime()).toBe(30 * 86_400_000);
  });

  it("objeto apagado depois do evento sai só com o id", async () => {
    db.deal.findMany.mockResolvedValue([]);
    const r = await listarEventos("o1", { tipos: ["deal.created"], cursor: null, limite: 5, agora });
    expect(r.data[0].data).toEqual({ id: "d1", deleted: true });
  });
});

describe("leitura da consulta", () => {
  it("tipos: vazio é tudo; desconhecido é erro", () => {
    expect(lerTipos(null)).toEqual(["*"]);
    expect(lerTipos("deal.*, task.completed")).toEqual(["deal.*", "task.completed"]);
    expect(() => lerTipos("pedido.criado")).toThrow(/desconhecido/);
  });
  it("cursor estragado é erro 400", () => {
    expect(() => lerCursor("lixo")).toThrow(/cursor inválido/);
  });
});
