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

describe("IA que cita ferramenta do CRM", () => {
  const ia = no("ia", "ai-agent", { detail: "Quando tiver nome e WhatsApp, chame crm_registrar_lead." });
  it("sem Ferramenta: CRM ligada, avisa", () => {
    const p = problemas([no("ini", "start"), ia], [liga("ini", "ia")]);
    expect(p).toContainEqual(expect.stringMatching(/^erro:ia:.*crm_registrar_lead.*Ferramenta: CRM/));
  });
  it("com a Ferramenta: CRM na porta de ferramentas, não avisa", () => {
    const tool: Edge = { id: "t", source: "crm", target: "ia", targetHandle: "tools" };
    const p = problemas([no("ini", "start"), ia, no("crm", "tool-crm", { crmAction: "registrar_lead" })], [liga("ini", "ia"), tool]);
    expect(p.filter((x) => x.includes("crm_registrar_lead"))).toEqual([]);
  });
});

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
    expect(problemas(nodes, [liga("ini", "ia")]).filter((p) => p.startsWith("erro:"))).toEqual([]);
  });

  it('IA sem a saída "Erro" ligada é aviso; ligada, some', () => {
    const nodes = [no("ini", "start"), no("ia", "ai-agent", { aiCredentialId: "c1" }), no("fim", "end")];
    expect(problemas(nodes, [liga("ini", "ia"), liga("ia", "fim")])).toEqual([expect.stringMatching(/^aviso:ia:.*"Erro"/)]);
    expect(problemas(nodes, [liga("ini", "ia"), liga("ia", "fim"), liga("ia", "fim", "erro")])).toEqual([]);
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

describe("bloco Enviar e-mail", () => {
  it("pelo contrato: precisa de modelo ou de assunto e corpo; Para é opcional (vai para o contato)", () => {
    const sem = [no("ini", "start"), no("m", "email", { emailSubject: "", emailBody: "" })];
    expect(problemas(sem, [liga("ini", "m")])).toContainEqual(expect.stringMatching(/^erro:m:.*modelo de e-mail/));
    const comModelo = [no("ini", "start"), no("m", "email", { emailModeloId: "x" }), no("fim", "end")];
    expect(problemas(comModelo, [liga("ini", "m"), liga("m", "fim")]).filter((p) => p.startsWith("erro:"))).toEqual([]);
    const comTexto = [no("ini", "start"), no("m", "email", { emailSubject: "Oi", emailBody: "Corpo" }), no("fim", "end")];
    expect(problemas(comTexto, [liga("ini", "m"), liga("m", "fim")]).filter((p) => p.startsWith("erro:"))).toEqual([]);
  });

  it("bloco antigo com credencial: continua pedindo credencial e destinatário", () => {
    const velho = [no("ini", "start"), no("m", "email", { emailCredentialId: "c1", emailTo: "" })];
    expect(problemas(velho, [liga("ini", "m")])).toContainEqual(expect.stringMatching(/^erro:m:.*destinatário/));
  });
});

describe("bloco de IA: saídas por intenção e resposta em variável", () => {
  const saida = { id: "s1", name: "Quer comprar", description: "pediu preço" };

  it("ligação na saída por intenção é válida", () => {
    const nodes = [no("ini", "start"), no("ia", "ai-agent", { aiExits: [saida] }), no("fim", "end")];
    expect(problemas(nodes, [liga("ini", "ia"), liga("ia", "fim", "s1")]).filter((p) => p.startsWith("erro"))).toEqual([]);
  });

  it("saída sem nome e resposta sem variável viram aviso no bloco", () => {
    const semNome = [no("ini", "start"), no("ia", "ai-agent", { aiExits: [{ ...saida, name: " " }] })];
    expect(problemas(semNome, [liga("ini", "ia")]).join()).toContain("Dê um nome a cada saída");
    const semVar = [no("ini", "start"), no("ia", "ai-agent", { aiSendToCustomer: false })];
    expect(problemas(semVar, [liga("ini", "ia")]).join()).toContain("variável que guarda a resposta");
  });
});

describe("Bloco do Studio", () => {
  const texto = { id: "c1", type: "text" as const, text: "Oi!" };

  it("bloco com conteúdo, condição e ações completas não tem erro; condição ligada é saída válida", () => {
    const bloco = no("b", "studio-block", {
      blockContents: [texto],
      exitConditions: [{ id: "vip", label: "VIP", expression: '{vip} == "sim"' }],
      entryActions: [{ id: "a1", data: { iconKey: "variable", label: "Marca", variableName: "x" } }],
    });
    const nodes = [no("ini", "start"), bloco, no("fim", "end"), no("fim2", "end")];
    const edges = [liga("ini", "b"), liga("b", "fim"), liga("b", "fim2", "vip")];
    expect(problemas(nodes, edges).filter((p) => p.startsWith("erro"))).toEqual([]);
  });

  it("pergunta sem texto, condição vazia e ação incompleta viram erro no bloco", () => {
    const comoErro = (extra: Partial<FlowNodeData>) =>
      problemas([no("ini", "start"), no("b", "studio-block", extra), no("fim", "end")], [liga("ini", "b"), liga("b", "fim")]).join();
    expect(comoErro({ waitForReply: true, variableName: "v" })).toContain("Escreva a pergunta no conteúdo");
    expect(comoErro({ blockContents: [texto], exitConditions: [{ id: "c", label: "C", expression: " " }] })).toContain(
      "Escreva a condição de cada saída"
    );
    expect(comoErro({ exitActions: [{ id: "a", data: { iconKey: "variable", label: "Marca" } }] })).toContain(
      'Ação "Marca": Dê um nome à variável.'
    );
  });
});
