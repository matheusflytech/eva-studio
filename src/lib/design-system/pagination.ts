/**
 * Lógica de paginação e de seleção de tabela — pura, testada, usada por
 * Pagination e DataTable em src/components/ui.
 */

export const PAGE_SIZES = [25, 50, 100] as const;

const numero = new Intl.NumberFormat("pt-BR");

export function totalPages(total: number, pageSize: number): number {
  if (total <= 0 || pageSize <= 0) return 1;
  return Math.ceil(total / pageSize);
}

/** Mantém a página dentro de 1..totalPages (ex.: depois de trocar o tamanho). */
export function clampPage(page: number, total: number, pageSize: number): number {
  const max = totalPages(total, pageSize);
  if (!Number.isFinite(page) || page < 1) return 1;
  return Math.min(Math.floor(page), max);
}

/** "1–25 de 24.752" (travessão, milhar com ponto). Sem itens: "0 de 0". */
export function formatPageRange(page: number, pageSize: number, total: number): string {
  if (total <= 0) return "0 de 0";
  const p = clampPage(page, total, pageSize);
  const inicio = (p - 1) * pageSize + 1;
  const fim = Math.min(p * pageSize, total);
  return `${numero.format(inicio)}–${numero.format(fim)} de ${numero.format(total)}`;
}

export type PageItem = number | "ellipsis-start" | "ellipsis-end";

/**
 * Números a mostrar: sempre a primeira e a última, a atual com `vizinhos` de
 * cada lado, e reticências onde houver buraco. A lista tem tamanho estável
 * (2 * vizinhos + 5) quando há páginas de sobra, para os botões não pularem
 * de lugar ao navegar.
 */
export function pageItems(current: number, pages: number, vizinhos = 1): PageItem[] {
  const total = Math.max(1, Math.floor(pages));
  const atual = Math.min(Math.max(1, Math.floor(current)), total);
  const slots = vizinhos * 2 + 5;
  if (total <= slots) return Array.from({ length: total }, (_, i) => i + 1);

  const lado = vizinhos + 3; // primeira + reticências + vizinhos... sem buraco
  if (atual <= lado) {
    return [...Array.from({ length: slots - 2 }, (_, i) => i + 1), "ellipsis-end", total];
  }
  if (atual > total - lado) {
    return [1, "ellipsis-start", ...Array.from({ length: slots - 2 }, (_, i) => total - (slots - 3) + i)];
  }
  const meio = Array.from({ length: vizinhos * 2 + 1 }, (_, i) => atual - vizinhos + i);
  return [1, "ellipsis-start", ...meio, "ellipsis-end", total];
}

export type SelectionState = "none" | "some" | "all";

/** Estado do checkbox "selecionar página" a partir das chaves da página atual. */
export function pageSelectionState(pageKeys: readonly string[], selected: ReadonlySet<string>): SelectionState {
  if (pageKeys.length === 0) return "none";
  let n = 0;
  for (const k of pageKeys) if (selected.has(k)) n++;
  if (n === 0) return "none";
  return n === pageKeys.length ? "all" : "some";
}

/** Clique no "selecionar página": se tudo marcado, desmarca a página; senão marca toda. */
export function togglePageSelection(pageKeys: readonly string[], selected: ReadonlySet<string>): Set<string> {
  const novo = new Set(selected);
  if (pageSelectionState(pageKeys, selected) === "all") pageKeys.forEach((k) => novo.delete(k));
  else pageKeys.forEach((k) => novo.add(k));
  return novo;
}

export type SortDirection = "asc" | "desc";
export interface SortState {
  key: string;
  direction: SortDirection;
}

/** Ciclo do cabeçalho: sem ordem → crescente → decrescente → sem ordem. */
export function nextSort(atual: SortState | null, key: string): SortState | null {
  if (!atual || atual.key !== key) return { key, direction: "asc" };
  if (atual.direction === "asc") return { key, direction: "desc" };
  return null;
}

export function ariaSort(atual: SortState | null, key: string): "ascending" | "descending" | "none" {
  if (!atual || atual.key !== key) return "none";
  return atual.direction === "asc" ? "ascending" : "descending";
}

/** Ordenação local (para listas pequenas; listas grandes ordenam no servidor). */
export function sortRows<T>(rows: readonly T[], sort: SortState | null, valor: (row: T, key: string) => unknown): T[] {
  if (!sort) return [...rows];
  const fator = sort.direction === "asc" ? 1 : -1;
  const comparar = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" }).compare;
  return [...rows].sort((a, b) => {
    const va = valor(a, sort.key);
    const vb = valor(b, sort.key);
    if (va == null && vb == null) return 0;
    if (va == null) return 1; // vazios sempre no fim
    if (vb == null) return -1;
    if (typeof va === "number" && typeof vb === "number") return (va - vb) * fator;
    return comparar(String(va), String(vb)) * fator;
  });
}
