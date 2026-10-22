import { describe, it, expect } from "vitest";
import { montarFluxoInicial } from "./fluxo-inicial";
import { validateFlow } from "./block-validation";
import { FLOW_TEMPLATES } from "./flow-templates";
import { precisaOrganizar } from "./auto-layout";

describe("montarFluxoInicial", () => {
  it("atendente com IA: boas-vindas, IA da Central e a saída Erro já ligada no atendente, sem nenhum problema", () => {
    const { nodes, edges } = montarFluxoInicial({ inicio: "ia", ia: { fonte: "conexao" }, boasVindas: "Oi!", objetivo: "Venda sofás." });
    expect(nodes.map((n) => n.data.iconKey)).toEqual(["start", "message", "ai-agent", "human"]);
    const ia = nodes.find((n) => n.data.iconKey === "ai-agent")!;
    expect(ia.data).toMatchObject({ aiFonte: "conexao", detail: "Venda sofás." });
    expect(edges.find((e) => e.source === ia.id)?.sourceHandle).toBe("erro");
    expect(validateFlow(nodes, edges)).toEqual([]);
    expect(precisaOrganizar(nodes)).toBe(false);
  });

  it("IA só deste agente: grava provedor, credencial e modelo no bloco", () => {
    const { nodes } = montarFluxoInicial({
      inicio: "ia",
      ia: { fonte: "bloco", provider: "openai", credentialId: "c1", model: "gpt-5.6-luna" },
    });
    expect(nodes.find((n) => n.data.iconKey === "ai-agent")!.data).toMatchObject({
      aiFonte: "bloco",
      aiProvider: "openai",
      aiCredentialId: "c1",
      aiModel: "gpt-5.6-luna",
    });
    // Sem boas-vindas: o Início liga direto na IA.
    expect(nodes.map((n) => n.data.iconKey)).toEqual(["start", "ai-agent", "human"]);
  });

  it("em branco: só o Início", () => {
    const { nodes, edges } = montarFluxoInicial({ inicio: "branco", ia: { fonte: "conexao" } });
    expect(nodes.map((n) => n.data.iconKey)).toEqual(["start"]);
    expect(edges).toEqual([]);
  });

  it("modelo pronto pelo id; id desconhecido cai no atendente com IA", () => {
    const modelo = FLOW_TEMPLATES[0];
    expect(montarFluxoInicial({ inicio: modelo.id, ia: { fonte: "conexao" } }).nodes.length).toBe(modelo.build().nodes.length);
    expect(montarFluxoInicial({ inicio: "nao-existe", ia: { fonte: "conexao" } }).nodes.some((n) => n.data.iconKey === "ai-agent")).toBe(true);
  });

  it("ids novos a cada chamada (dois agentes não colidem)", () => {
    const a = montarFluxoInicial({ inicio: "ia", ia: { fonte: "conexao" } });
    const b = montarFluxoInicial({ inicio: "ia", ia: { fonte: "conexao" } });
    expect(a.nodes[0].id).not.toBe(b.nodes[0].id);
  });
});

describe("modelos prontos", () => {
  it("os modelos com IA usam a Central e já ligam a saída Erro (nenhum aviso de Erro solta)", () => {
    for (const t of FLOW_TEMPLATES) {
      const { nodes, edges } = t.build();
      const avisos = validateFlow(nodes, edges).filter((i) => i.motivo.includes('"Erro"'));
      expect(avisos, t.id).toEqual([]);
      for (const ia of nodes.filter((n) => n.data.iconKey === "ai-agent")) expect(ia.data.aiFonte, t.id).toBe("conexao");
    }
  });

  it("FAQ com IA: a base de conhecimento fica ligada na porta de ferramentas da IA", () => {
    const { nodes, edges } = FLOW_TEMPLATES.find((t) => t.id === "faq-ia")!.build();
    const ia = nodes.find((n) => n.data.iconKey === "ai-agent")!;
    const base = nodes.find((n) => n.data.iconKey === "tool-knowledge")!;
    expect(edges).toContainEqual(expect.objectContaining({ source: base.id, target: ia.id, targetHandle: "tools" }));
  });

  it("Atendimento pelo n8n: usa o bloco do n8n e o fluxo inicial monta ele", () => {
    const { nodes } = montarFluxoInicial({ inicio: "atendimento-n8n", ia: { fonte: "conexao" } });
    expect(nodes.map((n) => n.data.iconKey)).toEqual(["start", "message", "agent", "end"]);
    expect(validateFlow(nodes, [], { temUrlDoFluxo: false }).some((i) => i.motivo.includes("URL do seu fluxo"))).toBe(true);
  });
});
