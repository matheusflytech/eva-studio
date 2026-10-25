import { saidasDe, type Definicao, type Ponta } from "./tipos";

// ---------------------------------------------------------------------------
// Layout da árvore da automação, da esquerda para a direita (como a demo
// "Eva Automação"): gatilho na primeira coluna, cada saída abre para a direita
// e os ramos empilham na vertical. Nó de tamanho fixo = layout determinístico,
// sem arrastar e sem fio solto. Saída vazia vira um espaço "+" para colocar o
// próximo passo. Puro: a tela só converte em nós/arestas do React Flow.
// ---------------------------------------------------------------------------

// v6: o nó é um quadrado com ícone; nome e resumo ficam embaixo, fora da
// caixa. Por isso o vão entre colunas e linhas é largo: cabe o rótulo (até
// ~176px de largura, centrado) e o "+"/nome do ramo sobre o fio.
export const NO_LARGURA = 88;
export const NO_ALTURA = 88;
export const VAZIO_LARGURA = 56;
export const VAZIO_ALTURA = 56;
const GAP_X = 150;
const GAP_Y = 68;
/** Distância entre o começo de uma coluna e o da seguinte. */
export const PASSO_X = NO_LARGURA + GAP_X;

export interface Caixa {
  id: string;
  tipo: "gatilho" | "no" | "vazio";
  x: number;
  y: number;
  largura: number;
  altura: number;
  /** Nó da definição (tipo "no"). */
  noId?: string;
  /** Onde o passo novo entra (tipo "vazio"). */
  ponta?: Ponta;
}

export interface Ligacao {
  id: string;
  de: string;
  para: string;
  /** Saída de onde parte (proximo, sim, nao, caminho:<id>...) e o nome que aparece na linha. */
  saida: string;
  nome: string;
  /** "+" no meio da ligação insere aqui (entre o de e o para). */
  ponta: Ponta;
  paraVazio: boolean;
}

export interface Layout {
  caixas: Caixa[];
  ligacoes: Ligacao[];
  largura: number;
  altura: number;
}

export function layoutDaAutomacao(def: Definicao): Layout {
  const caixas: Caixa[] = [];
  const ligacoes: Ligacao[] = [];
  const alturas = new Map<string, number>();
  const visitando = new Set<string>();

  // Altura do ramo que começa em `alvo` (null = espaço vazio).
  const medir = (alvo: string | null): number => {
    if (!alvo || !def.nos[alvo] || visitando.has(alvo)) return VAZIO_ALTURA;
    if (alturas.has(alvo)) return alturas.get(alvo)!;
    visitando.add(alvo);
    const saidas = saidasDe(def.nos[alvo]);
    const filhos = saidas.map((s) => medir(s.alvo));
    visitando.delete(alvo);
    const soma = filhos.reduce((a, b) => a + b, 0) + Math.max(0, filhos.length - 1) * GAP_Y;
    const h = Math.max(NO_ALTURA, soma);
    alturas.set(alvo, h);
    return h;
  };

  let maxX = 0;
  let maxY = 0;
  const colocados = new Set<string>();

  const colocarSaida = (deCaixa: string, ponta: Ponta, nome: string, alvo: string | null, coluna: number, topo: number) => {
    if (!alvo || !def.nos[alvo] || colocados.has(alvo)) {
      const id = `vazio:${ponta.de}:${ponta.saida}`;
      // Centrado na coluna: o meio do "+" fica na mesma linha do meio dos nós.
      const x = coluna * (NO_LARGURA + GAP_X) + (NO_LARGURA - VAZIO_LARGURA) / 2;
      const y = topo;
      caixas.push({ id, tipo: "vazio", x, y, largura: VAZIO_LARGURA, altura: VAZIO_ALTURA, ponta });
      ligacoes.push({ id: `l:${id}`, de: deCaixa, para: id, saida: ponta.saida, nome, ponta, paraVazio: true });
      maxX = Math.max(maxX, x + VAZIO_LARGURA);
      maxY = Math.max(maxY, y + VAZIO_ALTURA);
      return;
    }
    colocarNo(alvo, coluna, topo);
    ligacoes.push({ id: `l:${ponta.de}:${ponta.saida}`, de: deCaixa, para: alvo, saida: ponta.saida, nome, ponta, paraVazio: false });
  };

  const colocarNo = (id: string, coluna: number, topo: number) => {
    colocados.add(id);
    const altura = medir(id);
    const x = coluna * (NO_LARGURA + GAP_X);
    const y = topo + (altura - NO_ALTURA) / 2;
    caixas.push({ id, tipo: "no", x, y, largura: NO_LARGURA, altura: NO_ALTURA, noId: id });
    maxX = Math.max(maxX, x + NO_LARGURA);
    maxY = Math.max(maxY, y + NO_ALTURA);
    const saidas = saidasDe(def.nos[id]);
    const filhos = saidas.map((s) => medir(s.alvo));
    const soma = filhos.reduce((a, b) => a + b, 0) + Math.max(0, filhos.length - 1) * GAP_Y;
    let cursor = topo + (altura - soma) / 2;
    saidas.forEach((s, i) => {
      colocarSaida(id, { de: id, saida: s.saida }, s.nome, s.alvo, coluna + 1, cursor);
      cursor += filhos[i] + GAP_Y;
    });
  };

  const alturaTotal = Math.max(NO_ALTURA, medir(def.inicio));
  caixas.push({ id: "gatilho", tipo: "gatilho", x: 0, y: (alturaTotal - NO_ALTURA) / 2, largura: NO_LARGURA, altura: NO_ALTURA });
  // O primeiro ramo ocupa a altura toda quando é um nó; se é só o "+", centra.
  colocarSaida("gatilho", { de: "gatilho", saida: "proximo" }, "", def.inicio, 1, (alturaTotal - medir(def.inicio)) / 2);
  maxX = Math.max(maxX, NO_LARGURA);
  maxY = Math.max(maxY, alturaTotal);
  return { caixas: comPosicoesSalvas(caixas, def), ligacoes, largura: maxX, altura: maxY };
}

/**
 * Blocos arrastados ficam onde a pessoa deixou; o "+" vazio de um bloco
 * arrastado vai junto (mesmo deslocamento). O resto segue o layout automático.
 */
function comPosicoesSalvas(caixas: Caixa[], def: Definicao): Caixa[] {
  const salvas = def.posicoes;
  if (!salvas || Object.keys(salvas).length === 0) return caixas;
  const deslocamento = new Map<string, { dx: number; dy: number }>();
  for (const c of caixas) {
    const p = c.tipo === "vazio" ? undefined : salvas[c.id];
    if (p) deslocamento.set(c.id, { dx: p.x - c.x, dy: p.y - c.y });
  }
  return caixas.map((c) => {
    const d = deslocamento.get(c.tipo === "vazio" ? (c.ponta?.de ?? "") : c.id);
    return d ? { ...c, x: c.x + d.dx, y: c.y + d.dy } : c;
  });
}
