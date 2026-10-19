import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "./flow-node";

// ---------------------------------------------------------------------------
// Como o rascunho montado pela IA entra no canvas. Puro (sem React), para dar
// para testar: "Substituir" troca tudo; "Acrescentar ao final" pendura o
// rascunho (sem o Início dele) na ponta do fluxo atual.
// ---------------------------------------------------------------------------

type Grafo = { nodes: Node<FlowNodeData>[]; edges: Edge[] };

const FERRAMENTA = (n: Node<FlowNodeData>) => n.data.iconKey.startsWith("tool-");
const TERMINAIS = new Set(["end", "human", "agent", "ai-agent"]);
const ESPACO_Y = 220;

export interface ResultadoDeAcrescentar extends Grafo {
  /** false = não achei onde ligar; o rascunho entrou solto, para ligar à mão. */
  ligado: boolean;
}

export function acrescentarAoFluxo(atual: Grafo, rascunho: Grafo): ResultadoDeAcrescentar {
  if (atual.nodes.length === 0) return { ...rascunho, ligado: true };

  const inicioDoRascunho = rascunho.nodes.find((n) => n.data.iconKey === "start");
  const entrada = inicioDoRascunho
    ? rascunho.edges.find((e) => e.source === inicioDoRascunho.id)?.target ?? null
    : rascunho.nodes[0]?.id ?? null;
  const novos = rascunho.nodes.filter((n) => n.id !== inicioDoRascunho?.id);
  const novasLigacoes = rascunho.edges.filter((e) => e.source !== inicioDoRascunho?.id && e.target !== inicioDoRascunho?.id);
  if (novos.length === 0 || !entrada) return { ...atual, ligado: false };

  // Posição: logo abaixo do fluxo atual, alinhado pelo Início dele.
  const ancoraX = atual.nodes.find((n) => n.data.iconKey === "start")?.position.x ?? Math.min(...atual.nodes.map((n) => n.position.x));
  const baseY = Math.max(...atual.nodes.map((n) => n.position.y)) + ESPACO_Y;
  const minY = Math.min(...novos.map((n) => n.position.y));
  const xEntrada = novos.find((n) => n.id === entrada)?.position.x ?? 0;
  const deslocados = novos.map((n) => ({
    ...n,
    position: { x: n.position.x - xEntrada + ancoraX, y: n.position.y - minY + baseY },
  }));

  let nodes = [...atual.nodes, ...deslocados];
  let edges = [...atual.edges, ...novasLigacoes];

  // 1) Ponta aberta: bloco sem saída que não termina a conversa de propósito.
  const pontas = atual.nodes.filter(
    (n) => !FERRAMENTA(n) && !TERMINAIS.has(n.data.iconKey) && n.data.hasSource !== false && !atual.edges.some((e) => e.source === n.id)
  );
  const ponta = pontas[pontas.length - 1];
  if (ponta) {
    const opcoes = ponta.data.iconKey === "capture" ? ponta.data.options ?? [] : [];
    const handle = ponta.data.iconKey === "condition" ? "true" : opcoes[0]?.id;
    edges.push({ id: crypto.randomUUID(), source: ponta.id, target: entrada, ...(handle ? { sourceHandle: handle } : {}) });
    return { nodes, edges, ligado: true };
  }

  // 2) Tudo termina em Encerrar: quem chegava no último Encerrar passa a
  // seguir para o rascunho, e esse Encerrar sai (o rascunho tem o seu).
  const encerramentos = atual.nodes.filter((n) => n.data.iconKey === "end" && atual.edges.some((e) => e.target === n.id));
  const fim = encerramentos[encerramentos.length - 1];
  if (fim) {
    edges = edges.map((e) => (e.target === fim.id ? { ...e, target: entrada } : e)).filter((e) => e.source !== fim.id);
    nodes = nodes.filter((n) => n.id !== fim.id);
    return { nodes, edges, ligado: true };
  }

  return { nodes, edges, ligado: false };
}
