import type { Node, Edge } from "@xyflow/react";

const COL_WIDTH = 320;
const ROW_HEIGHT = 150;

// Layout em camadas por BFS a partir dos nós sem entrada (normalmente só o
// "Início") — profundidade = coluna (x), ordem de visita = linha (y),
// centralizado por coluna. Canvas horizontal (esquerda→direita, igual n8n).
// Não usa nenhuma lib de grafo (dagre/elkjs): fluxos de chatbot são
// majoritariamente árvores rasas, então BFS simples já organiza bem sem
// trazer dependência nova pro projeto.
export function autoLayoutNodes<T extends Record<string, unknown>>(
  nodes: Node<T>[],
  edges: Edge[]
): Node<T>[] {
  if (nodes.length === 0) return nodes;

  const outgoing = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();
  nodes.forEach((n) => incomingCount.set(n.id, 0));
  edges.forEach((e) => {
    if (!nodes.some((n) => n.id === e.source) || !nodes.some((n) => n.id === e.target)) return;
    if (!outgoing.has(e.source)) outgoing.set(e.source, []);
    outgoing.get(e.source)!.push(e.target);
    incomingCount.set(e.target, (incomingCount.get(e.target) ?? 0) + 1);
  });

  const roots = nodes.filter((n) => (incomingCount.get(n.id) ?? 0) === 0).map((n) => n.id);
  const depth = new Map<string, number>();
  const order: string[] = [];
  const visited = new Set<string>(roots);
  const queue: string[] = [...roots];
  roots.forEach((id) => depth.set(id, 0));

  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    for (const next of outgoing.get(id) ?? []) {
      if (visited.has(next)) continue;
      visited.add(next);
      depth.set(next, (depth.get(id) ?? 0) + 1);
      queue.push(next);
    }
  }

  // Blocos soltos (sem ligação com o Início) vão numa coluna extra no final,
  // em vez de sumirem do layout.
  const unreached = nodes.filter((n) => !visited.has(n.id));
  const maxDepth = Math.max(0, ...Array.from(depth.values()));
  unreached.forEach((n) => depth.set(n.id, maxDepth + 1));
  order.push(...unreached.map((n) => n.id));

  const rowByCol = new Map<number, number>();
  const row = new Map<string, number>();
  order.forEach((id) => {
    const d = depth.get(id) ?? 0;
    const r = rowByCol.get(d) ?? 0;
    rowByCol.set(d, r + 1);
    row.set(id, r);
  });

  return nodes.map((n) => {
    const d = depth.get(n.id) ?? 0;
    const colCount = rowByCol.get(d) ?? 1;
    const colHeight = (colCount - 1) * ROW_HEIGHT;
    const r = row.get(n.id) ?? 0;
    return { ...n, position: { x: d * COL_WIDTH, y: r * ROW_HEIGHT - colHeight / 2 + 250 } };
  });
}
