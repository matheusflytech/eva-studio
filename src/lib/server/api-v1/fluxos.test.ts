import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  pipeline: { findMany: vi.fn() },
  pipelineStage: { findMany: vi.fn() },
  tag: { findMany: vi.fn() },
  credential: { findMany: vi.fn() },
  mcpServer: { findMany: vi.fn() },
  profile: { findMany: vi.fn() },
  agentFlow: { findUnique: vi.fn(), upsert: vi.fn() },
  agentFlowVersion: { create: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));

import { substituirFluxo, validarFluxo } from "./fluxos";
import { ErroApi } from "./http";

const no = (id: string, iconKey: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "flowNode",
  position: { x: 0, y: 0 },
  data: { iconKey, label: id, ...extra },
});
const liga = (source: string, target: string, id = `${source}-${target}`) => ({ id, source, target });

async function problemas(fluxo: { nodes: unknown[]; edges: unknown[] }) {
  try {
    await validarFluxo("o1", fluxo);
    return [];
  } catch (e) {
    expect(e).toBeInstanceOf(ErroApi);
    return ((e as ErroApi).extra.details as { issues: { code: string }[] }).issues.map((i) => i.code);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  for (const m of [db.pipeline, db.pipelineStage, db.tag, db.credential, db.mcpServer, db.profile]) m.findMany.mockResolvedValue([]);
});

describe("validação do fluxo pela API", () => {
  it("fluxo completo passa e sai limpo", async () => {
    db.pipelineStage.findMany.mockResolvedValue([{ id: "s1" }]);
    const r = await validarFluxo("o1", {
      nodes: [no("a", "start"), no("b", "message", { detail: "Oi!" }), no("c", "crm-stage", { crmStageId: "s1" }), no("d", "end")],
      edges: [liga("a", "b"), liga("b", "c"), liga("c", "d")],
    });
    expect(r.nodes).toHaveLength(4);
    expect(db.pipelineStage.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["s1"] }, pipeline: { orgId: "o1" } } }));
  });

  it("sem Início, dois Inícios, id repetido, tipo desconhecido e ligação solta", async () => {
    expect(await problemas({ nodes: [no("b", "end")], edges: [] })).toContain("start_block");
    expect(await problemas({ nodes: [no("a", "start"), no("b", "start")], edges: [] })).toContain("start_block");
    expect(await problemas({ nodes: [no("a", "start"), no("a", "end")], edges: [liga("a", "a")] })).toContain("duplicate_node_id");
    expect(await problemas({ nodes: [no("a", "start"), no("x", "teleporte")], edges: [] })).toContain("unknown_block_type");
    expect(await problemas({ nodes: [no("a", "start"), no("b", "end")], edges: [liga("a", "fantasma")] })).toContain("dangling_edge");
  });

  it("pendência do Builder bloqueia (mensagem vazia, bloco sem saída)", async () => {
    const codes = await problemas({ nodes: [no("a", "start"), no("b", "message", { detail: "" })], edges: [liga("a", "b")] });
    expect(codes.filter((c) => c === "block_incomplete").length).toBeGreaterThanOrEqual(2);
  });

  it("etapa ou etiqueta de outra organização é recusada", async () => {
    const codes = await problemas({
      nodes: [no("a", "start"), no("b", "crm-tag", { crmTagId: "t-de-outra-org" }), no("c", "end")],
      edges: [liga("a", "b"), liga("b", "c")],
    });
    expect(codes).toEqual(["invalid_reference"]);
  });

  it("substituir guarda a versão anterior", async () => {
    db.agentFlow.findUnique.mockResolvedValueOnce({ agentId: "ag1", nodes: [{ id: "velho" }], edges: [] });
    await substituirFluxo("o1", "ag1", { nodes: [], edges: [] });
    expect(db.agentFlowVersion.create).toHaveBeenCalledWith({
      data: { orgId: "o1", agentId: "ag1", nodes: [{ id: "velho" }], edges: [], origem: "api" },
    });
  });
});
