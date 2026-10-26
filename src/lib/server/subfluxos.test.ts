import { describe, it, expect, vi, beforeEach } from "vitest";

const db = vi.hoisted(() => ({
  agentSubflow: { findMany: vi.fn(), create: vi.fn((a: unknown) => a), update: vi.fn((a: unknown) => a), count: vi.fn(), findFirst: vi.fn() },
  $transaction: vi.fn(async (ops: unknown[]) => ops),
}));
const fluxos = vi.hoisted(() => ({
  validarFluxo: vi.fn(async (_org: string, b: { nodes: unknown; edges: unknown }) => ({ nodes: b.nodes, edges: b.edges, avisos: [] })),
  substituirFluxo: vi.fn(),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: db }));
vi.mock("@/lib/server/api-v1/fluxos", () => fluxos);

import { importarPacote, remapearDestinos } from "./subfluxos";

const op = { modo: "api" as const, temUrlDoFluxo: false };
const ir = (id: string, alvo: string) => ({ id, position: { x: 0, y: 0 }, data: { iconKey: "go-to-flow", label: id, targetFlowId: alvo } });
const inicio = { id: "i", position: { x: 0, y: 0 }, data: { iconKey: "start", label: "Início" } };

beforeEach(() => {
  vi.clearAllMocks();
  db.agentSubflow.findMany.mockResolvedValue([{ id: "existente-vendas", name: "Vendas" }]);
});

describe("pacote de fluxos", () => {
  it("Ir para fluxo aponta para o fluxo deste agente; principal fica; destino fora do pacote vira vazio", () => {
    const r = remapearDestinos([ir("a", "velho"), ir("b", "main"), ir("c", "sumiu")] as never, new Map([["velho", "novo"]]));
    expect(r.nodes.map((n) => n.data.targetFlowId)).toEqual(["novo", "main", ""]);
    expect(r.soltos).toEqual(["c"]);
  });

  it("importa: principal substituído, mesmo nome atualiza, nome novo cria, e os destinos são remapeados", async () => {
    const r = await importarPacote("o1", "a1", {
      format: "eva.flows",
      main: { nodes: [inicio, ir("x", "f-vendas"), ir("y", "f-suporte")], edges: [] },
      subflows: [
        { id: "f-vendas", name: "vendas", keywords: ["preço"], nodes: [inicio], edges: [] },
        { id: "f-suporte", name: "Suporte", nodes: [inicio, ir("z", "main")], edges: [] },
      ],
    }, op);
    expect(r).toMatchObject({ criados: 1, atualizados: 1, avisos: [] });
    const principal = fluxos.substituirFluxo.mock.calls[0][2].nodes as { id: string; data: { targetFlowId?: string } }[];
    const novoSuporte = (db.agentSubflow.create.mock.calls[0][0] as { data: { id: string } }).data;
    expect(principal.find((n) => n.id === "x")?.data.targetFlowId).toBe("existente-vendas");
    expect(principal.find((n) => n.id === "y")?.data.targetFlowId).toBe(novoSuporte.id);
    expect(novoSuporte).toMatchObject({ agentId: "a1", name: "Suporte", position: 1 });
    expect(db.agentSubflow.update.mock.calls[0][0] as object).toMatchObject({ where: { id: "existente-vendas" }, data: { keywords: ["preço"] } });
    expect(fluxos.substituirFluxo.mock.calls[0][3]).toBe("importacao");
  });

  it("recusa o que não é pacote da Eva e nome repetido, sem gravar nada", async () => {
    await expect(importarPacote("o1", "a1", { nodes: [], edges: [] }, op)).rejects.toMatchObject({ status: 400 });
    await expect(
      importarPacote("o1", "a1", { format: "eva.flows", main: { nodes: [inicio], edges: [] }, subflows: [{ name: "A" }, { name: "a" }] }, op)
    ).rejects.toMatchObject({ status: 400 });
    expect(fluxos.substituirFluxo).not.toHaveBeenCalled();
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("fluxo inválido no pacote: diz qual e não grava nada", async () => {
    const { ErroApi } = await import("@/lib/server/api-v1/http");
    fluxos.validarFluxo.mockImplementation(async (_o: string, b: { nodes: unknown; edges: unknown }) => {
      if (Array.isArray(b.nodes) && b.nodes.length === 0) throw new ErroApi(422, "invalid_flow", "O fluxo tem 1 problema.");
      return { nodes: b.nodes, edges: b.edges, avisos: [] };
    });
    await expect(
      importarPacote("o1", "a1", { format: "eva.flows", main: { nodes: [inicio], edges: [] }, subflows: [{ name: "Quebrado", nodes: [], edges: [] }] }, op)
    ).rejects.toMatchObject({ status: 422, message: 'Fluxo "Quebrado": O fluxo tem 1 problema.' });
    expect(fluxos.substituirFluxo).not.toHaveBeenCalled();
  });
});
