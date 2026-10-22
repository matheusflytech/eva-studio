import { describe, it, expect } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "./flow-node";
import { alturaEstimada, organizarFluxo, precisaOrganizar, LARGURA_DO_BLOCO } from "./auto-layout";

function no(id: string, iconKey: FlowNodeData["iconKey"], extra: Partial<FlowNodeData> = {}): Node<FlowNodeData> {
  return { id, type: "flowNode", position: { x: 0, y: 0 }, data: { iconKey, label: id, ...extra } };
}
const liga = (source: string, target: string, sourceHandle?: string, targetHandle?: string): Edge => ({
  id: `${source}-${sourceHandle ?? ""}-${target}`,
  source,
  target,
  ...(sourceHandle ? { sourceHandle } : {}),
  ...(targetHandle ? { targetHandle } : {}),
});

type Caixa = { id: string; x: number; y: number; w: number; h: number };
function caixas(nodes: Node<FlowNodeData>[]): Caixa[] {
  return nodes.map((n) => ({ id: n.id, x: n.position.x, y: n.position.y, w: LARGURA_DO_BLOCO, h: n.measured?.height ?? alturaEstimada(n.data) }));
}
function sobrepostos(nodes: Node<FlowNodeData>[]): string[] {
  const c = caixas(nodes);
  const pares: string[] = [];
  for (let i = 0; i < c.length; i += 1) {
    for (let j = i + 1; j < c.length; j += 1) {
      const a = c[i];
      const b = c[j];
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) pares.push(`${a.id}×${b.id}`);
    }
  }
  return pares;
}
const pos = (nodes: Node<FlowNodeData>[], id: string) => nodes.find((n) => n.id === id)!.position;

// Fluxo com condição, menu de três opções, captura validada, IA com
// ferramentas e um bloco solto: o pior caso realista do builder.
function fluxoGrande() {
  const nodes = [
    no("ini", "start"),
    no("msg", "message", { detail: "Olá! Seja bem-vindo. ".repeat(6) }),
    no("cond", "condition", { conditionExpression: "{x} > 1" }),
    no("sim", "message", { detail: "Caminho sim" }),
    no("nao", "message", { detail: "Caminho não" }),
    no("menu", "capture", {
      detail: "Escolha",
      options: [
        { id: "o1", label: "Comercial" },
        { id: "o2", label: "Financeiro" },
        { id: "o3", label: "Suporte" },
      ],
    }),
    no("a1", "message", { detail: "Comercial" }),
    no("a2", "message", { detail: "Financeiro" }),
    no("a3", "human", { detail: "Suporte" }),
    no("mail", "capture", { detail: "Seu e-mail?", captureField: "email" }),
    no("ok", "ai-agent", { detail: "Atenda" }),
    no("t1", "tool-knowledge"),
    no("t2", "tool-crm", { crmToolActions: ["buscar"] }),
    no("ruim", "end"),
    no("solto", "message", { detail: "Ninguém chega aqui" }),
  ];
  const edges = [
    liga("ini", "msg"),
    liga("msg", "cond"),
    // De propósito na ordem invertida: o layout tem de pôr Sim em cima mesmo assim.
    liga("cond", "nao", "false"),
    liga("cond", "sim", "true"),
    liga("sim", "menu"),
    liga("nao", "menu"),
    liga("menu", "a3", "o3"),
    liga("menu", "a1", "o1"),
    liga("menu", "a2", "o2"),
    liga("a1", "mail"),
    liga("mail", "ruim", "invalido"),
    liga("mail", "ok"),
    liga("t1", "ok", undefined, "tools"),
    liga("t2", "ok", undefined, "tools"),
  ];
  return { nodes, edges };
}

describe("organizarFluxo (auto-layout esquerda→direita)", () => {
  it("não deixa nenhum cartão em cima de outro", () => {
    const { nodes, edges } = fluxoGrande();
    const out = organizarFluxo(nodes, edges);
    expect(sobrepostos(out)).toEqual([]);
  });

  it("usa a altura medida do cartão quando existe", () => {
    const { nodes, edges } = fluxoGrande();
    const altos = nodes.map((n) => (n.id === "sim" ? { ...n, measured: { width: LARGURA_DO_BLOCO, height: 600 } } : n));
    const out = organizarFluxo(altos, edges);
    expect(sobrepostos(out)).toEqual([]);
  });

  it("anda da esquerda para a direita seguindo as ligações", () => {
    const { nodes, edges } = fluxoGrande();
    const out = organizarFluxo(nodes, edges);
    expect(pos(out, "ini").x).toBeLessThan(pos(out, "msg").x);
    expect(pos(out, "msg").x).toBeLessThan(pos(out, "cond").x);
    expect(pos(out, "cond").x).toBeLessThan(pos(out, "sim").x);
    expect(pos(out, "menu").x).toBeLessThan(pos(out, "a1").x);
  });

  it("Sim em cima, Não embaixo; opções do menu na ordem; 'não respondeu certo' por último", () => {
    const { nodes, edges } = fluxoGrande();
    const out = organizarFluxo(nodes, edges);
    expect(pos(out, "sim").y).toBeLessThan(pos(out, "nao").y);
    expect(pos(out, "a1").y).toBeLessThan(pos(out, "a2").y);
    expect(pos(out, "a2").y).toBeLessThan(pos(out, "a3").y);
    expect(pos(out, "ok").y).toBeLessThan(pos(out, "ruim").y);
  });

  it("ferramentas ficam embaixo do bloco de IA, não numa coluna antes dele", () => {
    const { nodes, edges } = fluxoGrande();
    const out = organizarFluxo(nodes, edges);
    const ia = pos(out, "ok");
    for (const t of ["t1", "t2"]) {
      expect(pos(out, t).y).toBeGreaterThan(ia.y + alturaEstimada(nodes.find((n) => n.id === "ok")!.data));
    }
  });

  it("é determinístico e não perde blocos soltos", () => {
    const { nodes, edges } = fluxoGrande();
    const a = organizarFluxo(nodes, edges);
    const b = organizarFluxo(nodes.map((n) => ({ ...n })), edges.map((e) => ({ ...e })));
    expect(a.map((n) => n.position)).toEqual(b.map((n) => n.position));
    expect(a.map((n) => n.id)).toEqual(nodes.map((n) => n.id));
    expect(Number.isFinite(pos(a, "solto").x)).toBe(true);
  });

  it("fluxo vazio volta vazio", () => {
    expect(organizarFluxo([], [])).toEqual([]);
  });
});

describe("precisaOrganizar", () => {
  it("tudo em (0,0) ou cartões sobrepostos pedem organização", () => {
    const { nodes } = fluxoGrande();
    expect(precisaOrganizar(nodes)).toBe(true);
    expect(precisaOrganizar([{ ...no("a", "message"), position: { x: 0, y: 0 } }, { ...no("b", "message"), position: { x: 100, y: 40 } }])).toBe(true);
  });

  it("fluxo já espaçado fica como está", () => {
    const { nodes, edges } = fluxoGrande();
    expect(precisaOrganizar(organizarFluxo(nodes, edges))).toBe(false);
    expect(precisaOrganizar([no("a", "start")])).toBe(false);
  });
});
