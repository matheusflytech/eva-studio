import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "./flow-node";
import { organizarFluxo } from "./auto-layout";
import { saidaParaNovoBloco, saidasDoBloco } from "./saidas";

// ---------------------------------------------------------------------------
// Como o rascunho montado pela IA entra no canvas. Puro (sem React), para dar
// para testar: "Substituir" troca tudo; "Acrescentar ao final" pendura o
// rascunho (sem o Início dele) na ponta do fluxo atual e reorganiza tudo
// com o auto-layout (esquerda→direita), para nada nascer empilhado.
// ---------------------------------------------------------------------------

type Grafo = { nodes: Node<FlowNodeData>[]; edges: Edge[] };

const FERRAMENTA = (n: Node<FlowNodeData>) => n.data.iconKey.startsWith("tool-");
const TERMINAIS = new Set(["end", "human", "agent", "ai-agent"]);

export interface ResultadoDeAcrescentar extends Grafo {
  /** false = não achei onde ligar; o rascunho entrou solto, para ligar à mão. */
  ligado: boolean;
}

export function acrescentarAoFluxo(atual: Grafo, rascunho: Grafo): ResultadoDeAcrescentar {
  if (atual.nodes.length === 0) return { nodes: organizarFluxo(rascunho.nodes, rascunho.edges), edges: rascunho.edges, ligado: true };

  const inicioDoRascunho = rascunho.nodes.find((n) => n.data.iconKey === "start");
  const entrada = inicioDoRascunho
    ? rascunho.edges.find((e) => e.source === inicioDoRascunho.id)?.target ?? null
    : rascunho.nodes[0]?.id ?? null;
  const novos = rascunho.nodes.filter((n) => n.id !== inicioDoRascunho?.id);
  const novasLigacoes = rascunho.edges.filter((e) => e.source !== inicioDoRascunho?.id && e.target !== inicioDoRascunho?.id);
  if (novos.length === 0 || !entrada) return { ...atual, ligado: false };

  let nodes = [...atual.nodes, ...novos];
  let edges = [...atual.edges, ...novasLigacoes];

  // 1) Ponta aberta: bloco com alguma saída livre (inclusive o "Não" de uma
  // Condição ou uma opção de menu sem ligação) que não termina a conversa
  // de propósito.
  const saidaLivre = (n: Node<FlowNodeData>) =>
    saidasDoBloco(n.data).some((s) => !atual.edges.some((e) => e.source === n.id && (e.sourceHandle ?? null) === s.id));
  const pontas = atual.nodes.filter((n) => !FERRAMENTA(n) && !TERMINAIS.has(n.data.iconKey) && saidaLivre(n));
  const ponta = pontas[pontas.length - 1];
  if (ponta) {
    const handle = saidaParaNovoBloco(ponta.data, ponta.id, atual.edges);
    edges.push({ id: crypto.randomUUID(), source: ponta.id, target: entrada, ...(handle ? { sourceHandle: handle } : {}) });
    return { nodes: organizarFluxo(nodes, edges), edges, ligado: true };
  }

  // 2) Tudo termina em Encerrar: quem chegava no último Encerrar passa a
  // seguir para o rascunho, e esse Encerrar sai (o rascunho tem o seu).
  const encerramentos = atual.nodes.filter((n) => n.data.iconKey === "end" && atual.edges.some((e) => e.target === n.id));
  const fim = encerramentos[encerramentos.length - 1];
  if (fim) {
    edges = edges.map((e) => (e.target === fim.id ? { ...e, target: entrada } : e)).filter((e) => e.source !== fim.id);
    nodes = nodes.filter((n) => n.id !== fim.id);
    return { nodes: organizarFluxo(nodes, edges), edges, ligado: true };
  }

  return { nodes: organizarFluxo(nodes, edges), edges, ligado: false };
}
