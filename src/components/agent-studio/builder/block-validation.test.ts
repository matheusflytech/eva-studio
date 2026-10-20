import { describe, it, expect } from "vitest";
import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "./flow-node";
import { validateFlow } from "./block-validation";
import { saidaParaNovoBloco } from "./saidas";
import { SAMPLE_EDGES, SAMPLE_NODES } from "./flow-data";
import { FLOW_TEMPLATES } from "./flow-templates";
import { precisaOrganizar } from "./auto-layout";

function no(id: string, iconKey: FlowNodeData["iconKey"], extra: Partial<FlowNodeData> = {}): Node<FlowNodeData> {
  return { id, type: "flowNode", position: { x: 0, y: 0 }, data: { iconKey, label: id, detail: "texto", ...extra } };
}
const liga = (source: string, target: string, sourceHandle?: string): Edge => ({
  id: `${source}-${sourceHandle ?? ""}-${target}`,
  source,
  target,
  ...(sourceHandle ? { sourceHandle } : {}),
});
const menu = (id: string) =>
  no(id, "capture", { variableName: "opcao", options: [{ id: "o1", label: "Comercial" }, { id: "o2", label: "Suporte" }] });

function problemas(nodes: Node<FlowNodeData>[], edges: Edge[], ctx?: Parameters<typeof validateFlow>[2]) {
  return validateFlow(nodes, edges, ctx).map((i) => `${i.nivel}:${i.nodeId}:${i.motivo}`);
}

describe("validação do fluxo: ramos e saídas", () => {
  it("condição precisa dos dois ramos", () => {
    const nodes = [no("ini", "start"), no("c", "condition", { conditionExpression: "{x} > 1" }), no("fim", "end")];
    const p = problemas(nodes, [liga("ini", "c"), liga("c", "fim", "true")]);
    expect(p).toEqual([expect.stringMatching(/^erro:c:.*Não/)]);
  });

  it("opção de menu sem ligação é aviso (não bloqueia); menu sem nenhuma ligação é erro", () => {
    const nodes = [no("ini", "start"), menu("m"), no("fim", "end")];
    const p = problemas(nodes, [liga("ini", "m"), liga("m", "fim", "o1")]);
    expect(p).toEqual([expect.stringMatching(/^aviso:m:.*Suporte/)]);
    expect(problemas(nodes, [liga("ini", "m")]).some((x) => x.startsWith("erro:m:"))).toBe(true);
  });

  it("ligação saindo de uma saída que não existe", () => {
    const nodes = [no("ini", "start"), menu("m"), no("fim", "end")];
    const p = problemas(nodes, [liga("ini", "m"), liga("m", "fim", "o1"), liga("m", "fim", "o2"), liga("m", "fim", "fantasma")]);
    expect(p).toEqual([expect.stringMatching(/^erro:m:.*não existe/)]);
    // Condição com ligação sem saída (o motor nunca segue).
    const c = [no("ini", "start"), no("c", "condition", { conditionExpression: "{x}" }), no("fim", "end")];
    expect(problemas(c, [liga("ini", "c"), liga("c", "fim", "true"), liga("c", "fim", "false"), liga("c", "fim")])).toEqual([
      expect.stringMatching(/^erro:c:.*não existe/),
    ]);
  });

  it("captura validada precisa da saída Respondeu", () => {
    const nodes = [no("ini", "start"), no("e", "capture", { captureField: "email" }), no("fim", "end")];
    expect(problemas(nodes, [liga("ini", "e"), liga("e", "fim", "invalido")])).toEqual([expect.stringMatching(/^erro:e:.*Respondeu/)]);
    expect(problemas(nodes, [liga("ini", "e"), liga("e", "fim")])).toEqual([]);
  });

  it("bloco sem caminho a partir do Início é aviso", () => {
    const nodes = [no("ini", "start"), no("a", "message"), no("solto", "message"), no("fim", "end")];
    const p = problemas(nodes, [liga("ini", "a"), liga("a", "fim"), liga("solto", "fim")]);
    expect(p).toEqual([expect.stringMatching(/^aviso:solto:.*Início/)]);
  });

  it("Enviar para meu fluxo sem URL do webhook do agente", () => {
    const nodes = [no("ini", "start"), no("ag", "agent")];
    const edges = [liga("ini", "ag")];
    expect(problemas(nodes, edges, { temUrlDoFluxo: false })).toEqual([expect.stringMatching(/^erro:ag:.*URL/)]);
    expect(problemas(nodes, edges, { temUrlDoFluxo: true })).toEqual([]);
    expect(problemas(nodes, edges)).toEqual([]); // sem saber do agente, não acusa
  });

  it("Responder com IA e Enviar para meu fluxo podem ficar sem saída (a conversa fica com eles)", () => {
    const nodes = [no("ini", "start"), no("ia", "ai-agent", { aiCredentialId: "c1" })];
    expect(problemas(nodes, [liga("ini", "ia")])).toEqual([]);
  });

  it("o exemplo e os modelos prontos passam sem erro e já vêm organizados", () => {
    expect(validateFlow(SAMPLE_NODES, SAMPLE_EDGES).filter((i) => i.nivel === "erro")).toEqual([]);
    expect(precisaOrganizar(SAMPLE_NODES)).toBe(false);
    for (const t of FLOW_TEMPLATES) {
      const { nodes, edges } = t.build();
      expect(validateFlow(nodes, edges).filter((i) => i.nivel === "erro"), t.id).toEqual([]);
      expect(precisaOrganizar(nodes), t.id).toBe(false);
    }
  });
});

describe("saída para o bloco novo", () => {
  it("Condição: Sim primeiro, depois Não; menu: a primeira opção livre", () => {
    const c = no("c", "condition");
    expect(saidaParaNovoBloco(c.data, "c", [])).toBe("true");
    expect(saidaParaNovoBloco(c.data, "c", [liga("c", "x", "true")])).toBe("false");
    const m = menu("m");
    expect(saidaParaNovoBloco(m.data, "m", [liga("m", "x", "o1")])).toBe("o2");
  });

  it("captura validada: Respondeu (sem id) e depois Não respondeu certo; bloco comum: sem id", () => {
    const e = no("e", "capture", { captureField: "email" });
    expect(saidaParaNovoBloco(e.data, "e", [])).toBeUndefined();
    expect(saidaParaNovoBloco(e.data, "e", [liga("e", "x")])).toBe("invalido");
    expect(saidaParaNovoBloco(no("a", "message").data, "a", [])).toBeUndefined();
  });
});
