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

  it("sem posição (tudo em 0,0): organiza esquerda→direita antes de salvar", async () => {
    const r = await validarFluxo("o1", {
      nodes: [no("a", "start"), no("b", "message", { detail: "Oi!" }), no("c", "end")],
      edges: [liga("a", "b"), liga("b", "c")],
    });
    expect(r.organizado).toBe(true);
    const x = (id: string) => r.nodes.find((n) => n.id === id)!.position.x;
    expect(x("a")).toBeLessThan(x("b"));
    expect(x("b")).toBeLessThan(x("c"));
  });

  it("posições já espaçadas ficam como vieram", async () => {
    const pos = (id: string, x: number) => ({ ...no(id, id === "a" ? "start" : id === "b" ? "message" : "end", id === "b" ? { detail: "Oi!" } : {}), position: { x, y: 0 } });
    const r = await validarFluxo("o1", { nodes: [pos("a", 0), pos("b", 400), pos("c", 800)], edges: [liga("a", "b"), liga("b", "c")] });
    expect(r.organizado).toBe(false);
    expect(r.nodes.map((n) => n.position.x)).toEqual([0, 400, 800]);
  });

  it("aviso não bloqueia (opção de menu solta) e volta na resposta", async () => {
    const r = await validarFluxo("o1", {
      nodes: [
        no("a", "start"),
        no("m", "capture", { detail: "Escolha", variableName: "op", options: [{ id: "o1", label: "Um" }, { id: "o2", label: "Dois" }] }),
        no("c", "end"),
      ],
      edges: [liga("a", "m"), { ...liga("m", "c"), sourceHandle: "o1" }],
    });
    expect(r.avisos.map((a) => a.code)).toEqual(["flow_warning"]);
  });

  it("condição com um ramo só e saída inexistente bloqueiam pela API", async () => {
    const codes = await problemas({
      nodes: [no("a", "start"), no("c", "condition", { conditionExpression: "{x} > 1" }), no("f", "end")],
      edges: [liga("a", "c"), { ...liga("c", "f"), sourceHandle: "true" }, { ...liga("c", "f", "c-f-2"), sourceHandle: "talvez" }],
    });
    expect(codes.filter((c) => c === "block_incomplete")).toHaveLength(2);
  });

  it("modo builder (salvamento interno): bloco incompleto vira aviso; estrutura quebrada bloqueia", async () => {
    const r = await validarFluxo(
      "o1",
      { nodes: [no("a", "start"), no("b", "message", { detail: "" })], edges: [liga("a", "b")] },
      { modo: "builder" }
    );
    expect(r.avisos.length).toBeGreaterThanOrEqual(2);
    expect(r.organizado).toBe(false);
    await expect(
      validarFluxo("o1", { nodes: [no("a", "start")], edges: [liga("a", "fantasma")] }, { modo: "builder" })
    ).rejects.toBeInstanceOf(ErroApi);
  });

  it("Enviar para meu fluxo sem URL no agente é recusado", async () => {
    const codes = await (async () => {
      try {
        await validarFluxo("o1", { nodes: [no("a", "start"), no("g", "agent")], edges: [liga("a", "g")] }, { temUrlDoFluxo: false });
        return [];
      } catch (e) {
        return ((e as ErroApi).extra.details as { issues: { code: string; message: string }[] }).issues.map((i) => i.message);
      }
    })();
    expect(codes.join(" ")).toMatch(/URL/);
  });

  it("substituir guarda a versão anterior", async () => {
    db.agentFlow.findUnique.mockResolvedValueOnce({ agentId: "ag1", nodes: [{ id: "velho" }], edges: [] });
    await substituirFluxo("o1", "ag1", { nodes: [], edges: [] });
    expect(db.agentFlowVersion.create).toHaveBeenCalledWith({
      data: { orgId: "o1", agentId: "ag1", nodes: [{ id: "velho" }], edges: [], origem: "api" },
    });
  });
});
