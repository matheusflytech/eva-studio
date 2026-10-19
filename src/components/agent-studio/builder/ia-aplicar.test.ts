import { describe, it, expect } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "./flow-node";
import { acrescentarAoFluxo } from "./ia-aplicar";

function no(id: string, iconKey: FlowNodeData["iconKey"], y = 0): Node<FlowNodeData> {
  return { id, type: "flowNode", position: { x: 0, y }, data: { iconKey, label: id } };
}
const ed = (source: string, target: string): Edge => ({ id: `${source}-${target}`, source, target });

const rascunho = {
  nodes: [no("r-ini", "start"), no("r-msg", "message", 190), no("r-fim", "end", 380)],
  edges: [ed("r-ini", "r-msg"), ed("r-msg", "r-fim")],
};

describe("acrescentarAoFluxo", () => {
  it("pendura o rascunho (sem o Início dele) na ponta aberta do fluxo", () => {
    const atual = { nodes: [no("ini", "start"), no("msg", "message", 150)], edges: [ed("ini", "msg")] };
    const r = acrescentarAoFluxo(atual, rascunho);
    expect(r.ligado).toBe(true);
    expect(r.nodes.map((n) => n.id)).toEqual(["ini", "msg", "r-msg", "r-fim"]);
    expect(r.edges.some((e) => e.source === "msg" && e.target === "r-msg")).toBe(true);
    // Abaixo do fluxo atual.
    expect(r.nodes.find((n) => n.id === "r-msg")!.position.y).toBeGreaterThan(150);
  });

  it("fluxo que termina em Encerrar: troca o último Encerrar pelo rascunho", () => {
    const atual = {
      nodes: [no("ini", "start"), no("msg", "message", 150), no("fim", "end", 300)],
      edges: [ed("ini", "msg"), ed("msg", "fim")],
    };
    const r = acrescentarAoFluxo(atual, rascunho);
    expect(r.ligado).toBe(true);
    expect(r.nodes.some((n) => n.id === "fim")).toBe(false);
    expect(r.edges.some((e) => e.source === "msg" && e.target === "r-msg")).toBe(true);
  });

  it("canvas vazio recebe o rascunho inteiro", () => {
    const r = acrescentarAoFluxo({ nodes: [], edges: [] }, rascunho);
    expect(r.nodes).toHaveLength(3);
  });

  it("sem ponta nem Encerrar ligado: entra solto e avisa", () => {
    const atual = { nodes: [no("ini", "start"), no("h", "human", 150)], edges: [ed("ini", "h")] };
    const r = acrescentarAoFluxo(atual, rascunho);
    expect(r.ligado).toBe(false);
    expect(r.nodes).toHaveLength(4);
  });
});
