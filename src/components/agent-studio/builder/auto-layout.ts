import dagre from "@dagrejs/dagre";
import type { Node, Edge } from "@xyflow/react";
import type { FlowNodeData } from "./flow-node";
import { ehFerramenta, ordemDaSaida, saidasDoBloco } from "./saidas";

// ---------------------------------------------------------------------------
// Auto-layout do fluxo, esquerda → direita (como as portas dos cartões).
//
// Por que dagre (@dagrejs/dagre): é o que a documentação do React Flow usa no
// exemplo de layout, é síncrono (roda igual no navegador, no servidor da API
// v1 e na montagem pela IA, sem Promise) e pequeno. O elkjs organiza portas
// melhor, mas é assíncrono e pesa ~1,4 MB; aqui a ordem dos ramos (Sim em
// cima, opções na ordem) sai das "constraints" de ordem do próprio dagre.
//
// Puro e determinístico: mesma entrada, mesmas posições. Usa a altura real
// do cartão quando o React Flow já mediu (node.measured.height) e uma
// estimativa pelo conteúdo quando não (servidor, IA, modelos).
// ---------------------------------------------------------------------------

export const LARGURA_DO_BLOCO = 230;
const ESPACO_ENTRE_COLUNAS = 90;
const ESPACO_ENTRE_LINHAS = 40;
const ESPACO_FERRAMENTAS = 56; // do pé do bloco de IA até a fileira de ferramentas
const ESPACO_ENTRE_FERRAMENTAS = 24;

/** Altura aproximada do cartão (flow-node.tsx) a partir do que ele mostra. */
export function alturaEstimada(data: FlowNodeData): number {
  const LINHA = 20; // texto 12px, leading-relaxed
  const CARACTERES_POR_LINHA = 32;
  let h = 28 + 34; // padding + cabeçalho (ícone 32px e título)
  const detalhe = (data.detail ?? "").trim();
  if (detalhe) {
    const linhas = detalhe
      .split("\n")
      .reduce((total, parte) => total + Math.max(1, Math.ceil(parte.length / CARACTERES_POR_LINHA)), 0);
    // Condição e Início mostram no máximo duas linhas; os outros, o texto todo.
    const visiveis = data.iconKey === "condition" || data.iconKey === "start" ? Math.min(2, linhas) : linhas;
    h += 10 + visiveis * LINHA;
  }
  if (
    data.conditionExpression ||
    data.variableName ||
    data.httpUrl ||
    data.webhookUrl ||
    data.emailTo ||
    data.iconKey === "ai-agent" ||
    data.iconKey === "tool-mcp" ||
    data.iconKey === "tool-knowledge" ||
    (data.iconKey === "wait" && data.waitDuration)
  ) {
    h += 28;
  }
  const saidas = saidasDoBloco(data);
  if (saidas.length > 1 || saidas.some((s) => s.rotulo)) h += 10 + saidas.length * 30;
  return Math.round(h);
}

function alturaDe(n: Node<FlowNodeData>): number {
  return n.measured?.height ?? n.height ?? alturaEstimada(n.data);
}

/**
 * Organiza o fluxo. Devolve os mesmos nós (mesma ordem), só com posição nova.
 * Ferramentas (porta de baixo do bloco de IA) não entram nas colunas: ficam
 * numa fileira embaixo do bloco de IA a que estão ligadas.
 */
export function organizarFluxo<T extends Node<FlowNodeData>>(nodes: T[], edges: Edge[]): T[] {
  if (nodes.length === 0) return nodes;
  const porId = new Map(nodes.map((n) => [n.id, n]));

  // Ferramentas de cada bloco de IA (na ordem em que aparecem nas ligações).
  const ferramentasDe = new Map<string, T[]>();
  const ferramentaPresa = new Set<string>();
  for (const e of edges) {
    const f = porId.get(e.source);
    const ia = porId.get(e.target);
    if (!f || !ia || e.targetHandle !== "tools" || !ehFerramenta(f.data.iconKey) || ferramentaPresa.has(f.id)) continue;
    ferramentaPresa.add(f.id);
    ferramentasDe.set(ia.id, [...(ferramentasDe.get(ia.id) ?? []), f]);
  }
  const larguraFerramentas = (lista: T[]) =>
    lista.length * LARGURA_DO_BLOCO + Math.max(0, lista.length - 1) * ESPACO_ENTRE_FERRAMENTAS;
  const alturaFerramentas = (lista: T[]) => (lista.length ? ESPACO_FERRAMENTAS + Math.max(...lista.map(alturaDe)) : 0);

  const g = new dagre.graphlib.Graph({ multigraph: true });
  g.setGraph({ rankdir: "LR", nodesep: ESPACO_ENTRE_LINHAS, ranksep: ESPACO_ENTRE_COLUNAS, marginx: 0, marginy: 0 });
  g.setDefaultEdgeLabel(() => ({}));

  for (const n of nodes) {
    if (ferramentaPresa.has(n.id)) continue;
    const ferramentas = ferramentasDe.get(n.id) ?? [];
    // O bloco de IA reserva o espaço da fileira de ferramentas embaixo dele,
    // para nada da mesma coluna cair em cima delas.
    g.setNode(n.id, {
      width: Math.max(LARGURA_DO_BLOCO, larguraFerramentas(ferramentas)),
      height: alturaDe(n) + alturaFerramentas(ferramentas),
    });
  }

  // Ligações do fluxo principal, ordenadas por bloco e pela ordem da saída
  // (Sim, Não; opção 1, 2, 3...). A ordem de inserção já orienta o dagre e as
  // constraints garantem os irmãos de cima para baixo.
  const ordemDoNo = new Map(nodes.map((n, i) => [n.id, i]));
  const principais = edges
    .filter((e) => e.targetHandle !== "tools" && g.hasNode(e.source) && g.hasNode(e.target) && e.source !== e.target)
    .map((e, i) => ({ e, i, ordem: ordemDaSaida(porId.get(e.source)!.data, e.sourceHandle) }))
    .sort((a, b) => ordemDoNo.get(a.e.source)! - ordemDoNo.get(b.e.source)! || a.ordem - b.ordem || a.i - b.i);
  principais.forEach(({ e }, i) => g.setEdge(e.source, e.target, {}, `l${i}`));

  // Constraint só entre irmãos que só têm esse pai (senão o mesmo bloco
  // poderia ter de ficar acima e abaixo de outro ao mesmo tempo).
  const entradas = new Map<string, number>();
  for (const { e } of principais) entradas.set(e.target, (entradas.get(e.target) ?? 0) + 1);
  const constraints: { left: string; right: string }[] = [];
  const porOrigem = new Map<string, string[]>();
  for (const { e } of principais) {
    if (entradas.get(e.target) !== 1) continue;
    const lista = porOrigem.get(e.source) ?? [];
    if (!lista.includes(e.target)) lista.push(e.target);
    porOrigem.set(e.source, lista);
  }
  for (const filhos of porOrigem.values()) {
    for (let i = 1; i < filhos.length; i += 1) constraints.push({ left: filhos[i - 1], right: filhos[i] });
  }

  dagre.layout(g, { constraints });

  const posicao = new Map<string, { x: number; y: number }>();
  for (const n of nodes) {
    if (ferramentaPresa.has(n.id)) continue;
    const c = g.node(n.id);
    // dagre devolve o centro da caixa; o React Flow quer o canto de cima.
    const topo = c.y - c.height / 2;
    posicao.set(n.id, { x: Math.round(c.x - LARGURA_DO_BLOCO / 2), y: Math.round(topo) });
    const ferramentas = ferramentasDe.get(n.id) ?? [];
    const yFerramentas = topo + alturaDe(n) + ESPACO_FERRAMENTAS;
    const xInicial = c.x - larguraFerramentas(ferramentas) / 2;
    ferramentas.forEach((f, i) => {
      posicao.set(f.id, {
        x: Math.round(xInicial + i * (LARGURA_DO_BLOCO + ESPACO_ENTRE_FERRAMENTAS)),
        y: Math.round(yFerramentas),
      });
    });
  }

  return nodes.map((n) => ({ ...n, position: posicao.get(n.id) ?? n.position }));
}

/**
 * O fluxo precisa ser organizado antes de salvar? Sim quando há cartões um em
 * cima do outro (o caso de quem manda o fluxo pela API sem posição: tudo cai
 * em 0,0). Usa a altura estimada, então é conservador.
 */
export function precisaOrganizar(nodes: Node<FlowNodeData>[]): boolean {
  for (let i = 0; i < nodes.length; i += 1) {
    const a = nodes[i];
    for (let j = i + 1; j < nodes.length; j += 1) {
      const b = nodes[j];
      const ha = alturaDe(a);
      const hb = alturaDe(b);
      if (
        a.position.x < b.position.x + LARGURA_DO_BLOCO &&
        b.position.x < a.position.x + LARGURA_DO_BLOCO &&
        a.position.y < b.position.y + hb &&
        b.position.y < a.position.y + ha
      ) {
        return true;
      }
    }
  }
  return false;
}
