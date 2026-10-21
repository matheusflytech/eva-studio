import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "./flow-node";
import { FLOW_TEMPLATES } from "./flow-templates";
import { organizarFluxo } from "./auto-layout";
import { SAIDA_ERRO } from "./saidas";
import { generateId } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Fluxo com que um agente novo nasce (criação em etapas).
//   "ia"     → Início → Boas-vindas (se houver) → Responder com IA, com a
//              saída "Erro" já ligada em "Falar com atendente" (nenhum bloco
//              de IA nasce sem caminho de falha).
//   "branco" → só o Início.
//   id de um modelo pronto → o modelo.
// A IA do bloco vem da etapa "IA": Central de IA do contrato ou uma chave e
// modelo só deste agente.
// ---------------------------------------------------------------------------

export type IaDoAgente =
  | { fonte: "conexao" }
  | { fonte: "bloco"; provider: string; credentialId: string; model: string };

export interface FluxoInicialOpcoes {
  inicio: "ia" | "branco" | string;
  ia: IaDoAgente;
  boasVindas?: string;
  /** O que a IA faz nesta etapa (texto do bloco). O jeito de falar vem do cadastro do agente. */
  objetivo?: string;
}

const no = (id: string, data: FlowNodeData): Node<FlowNodeData> => ({ id, type: "flowNode", position: { x: 0, y: 0 }, data });
const liga = (source: string, target: string, sourceHandle?: string): Edge => ({
  id: `e-${source}-${target}${sourceHandle ? `-${sourceHandle}` : ""}`,
  source,
  target,
  ...(sourceHandle ? { sourceHandle } : {}),
});

function dadosDaIa(ia: IaDoAgente): Partial<FlowNodeData> {
  if (ia.fonte === "conexao") return { aiFonte: "conexao" };
  return { aiFonte: "bloco", aiProvider: ia.provider, aiCredentialId: ia.credentialId, aiModel: ia.model };
}

export function montarFluxoInicial(opts: FluxoInicialOpcoes): { nodes: Node<FlowNodeData>[]; edges: Edge[] } {
  const inicio = generateId();
  const nodeInicio = no(inicio, { iconKey: "start", label: "Início", kind: "Ponto de entrada", hasTarget: false });

  if (opts.inicio === "branco") return { nodes: [nodeInicio], edges: [] };

  if (opts.inicio !== "ia") {
    const modelo = FLOW_TEMPLATES.find((t) => t.id === opts.inicio);
    if (modelo) return modelo.build();
  }

  const nodes: Node<FlowNodeData>[] = [nodeInicio];
  const edges: Edge[] = [];
  let anterior = inicio;

  const boasVindas = opts.boasVindas?.trim();
  if (boasVindas) {
    const id = generateId();
    nodes.push(no(id, { iconKey: "message", label: "Boas-vindas", kind: "Mensagem", detail: boasVindas }));
    edges.push(liga(anterior, id));
    anterior = id;
  }

  const ia = generateId();
  const humano = generateId();
  nodes.push(
    no(ia, {
      iconKey: "ai-agent",
      label: "Atendimento com IA",
      kind: "Responde com a Central de IA",
      detail: opts.objetivo?.trim() || "Atenda a pessoa, tire as dúvidas dela e, se ela pedir, passe para um atendente.",
      aiMemoryWindow: 20,
      collectVars: [],
      ...dadosDaIa(opts.ia),
    }),
    no(humano, {
      iconKey: "human",
      label: "Falar com atendente",
      kind: "Para o bot e chama uma pessoa",
      detail: "Vou te passar para alguém da equipe, só um instante.",
    })
  );
  edges.push(liga(anterior, ia), liga(ia, humano, SAIDA_ERRO));

  return { nodes: organizarFluxo(nodes, edges), edges };
}
