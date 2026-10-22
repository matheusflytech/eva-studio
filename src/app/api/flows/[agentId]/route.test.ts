import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  agent: { findFirst: vi.fn() },
  agentFlow: { findUnique: vi.fn(), upsert: vi.fn() },
  pipeline: { findMany: vi.fn(async () => []) },
  pipelineStage: { findMany: vi.fn(async () => []) },
  tag: { findMany: vi.fn(async () => []) },
  credential: { findMany: vi.fn(async () => []) },
  mcpServer: { findMany: vi.fn(async () => []) },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/auth/require-org", () => ({ requireOrgId: vi.fn(async () => "o1") }));

import { PUT } from "./route";

const params = Promise.resolve({ agentId: "a1" });
const put = (body: unknown) => PUT(new Request("https://eva.test/api", { method: "PUT", body: JSON.stringify(body) }), { params });
const no = (id: string, iconKey: string, extra: Record<string, unknown> = {}) => ({
  id,
  type: "flowNode",
  position: { x: 0, y: 0 },
  data: { iconKey, label: id, ...extra },
});

beforeEach(() => {
  vi.clearAllMocks();
  db.agent.findFirst.mockResolvedValue({ id: "a1", outboundUrl: "" });
});

describe("salvamento interno do Builder", () => {
  it("bloco pela metade salva e devolve os avisos (o canvas salva enquanto a pessoa monta)", async () => {
    const res = await put({ nodes: [no("a", "start"), no("b", "message", { detail: "" })], edges: [{ id: "e", source: "a", target: "b" }] });
    expect(res.status).toBe(200);
    expect(db.agentFlow.upsert).toHaveBeenCalled();
    const corpo = await res.json();
    expect(corpo.avisos.length).toBeGreaterThan(0);
  });

  it("estrutura quebrada não salva (ligação para bloco que não existe, sem Início)", async () => {
    const res = await put({ nodes: [no("a", "start")], edges: [{ id: "e", source: "a", target: "fantasma" }] });
    expect(res.status).toBe(422);
    expect(db.agentFlow.upsert).not.toHaveBeenCalled();
    const corpo = await res.json();
    expect(corpo.error).toMatch(/problema/);
    expect(corpo.issues[0].code).toBe("dangling_edge");

    const semInicio = await put({ nodes: [no("b", "end")], edges: [] });
    expect(semInicio.status).toBe(422);
  });

  it("não reorganiza o que a pessoa arrumou à mão", async () => {
    await put({ nodes: [no("a", "start"), no("b", "end")], edges: [{ id: "e", source: "a", target: "b" }] });
    const salvo = db.agentFlow.upsert.mock.calls[0][0].update.nodes;
    expect(salvo.map((n: { position: { x: number } }) => n.position.x)).toEqual([0, 0]);
  });
});
