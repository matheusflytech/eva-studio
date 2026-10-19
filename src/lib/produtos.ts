// ---------------------------------------------------------------------------
// Produtos no negócio: as contas e as leituras de entrada, sem banco nem
// React. A rota, a ficha, o cartão, a planilha e o dashboard usam as mesmas
// funções, então o total que a tela mostra é o mesmo que o servidor grava.
//
// Dinheiro sempre em centavos (Int). Desconto percentual em centésimos de
// ponto (1050 = 10,50%), para também ser inteiro.
// ---------------------------------------------------------------------------

import { parseReais } from "@/lib/dinheiro";

export type Recorrencia = "unico" | "mensal" | "anual";
export type TipoDeDesconto = "percentual" | "valor";

export const RECORRENCIAS: { id: Recorrencia; rotulo: string }[] = [
  { id: "unico", rotulo: "Único" },
  { id: "mensal", rotulo: "Mensal" },
  { id: "anual", rotulo: "Anual" },
];

/** Tetos: item por negócio, produtos por organização, quantidade de um item. */
export const MAX_ITENS_POR_NEGOCIO = 100;
export const MAX_PRODUTOS_POR_ORG = 2_000;
export const MAX_QUANTIDADE = 1_000_000;
/** 100% em centésimos de ponto. */
export const CEM_POR_CENTO = 10_000;

export function lerRecorrencia(v: unknown): Recorrencia | null {
  return v === "unico" || v === "mensal" || v === "anual" ? v : null;
}

export function rotuloDaRecorrencia(r: string): string {
  return RECORRENCIAS.find((x) => x.id === r)?.rotulo ?? "Único";
}

export function lerTipoDeDesconto(v: unknown): TipoDeDesconto | null {
  return v === "percentual" || v === "valor" ? v : null;
}

/** "1,5" / 1.5 → 1.5 (3 casas). undefined = não veio; null = inválida. */
export function lerQuantidade(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  let n: number;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") {
    const s = v.trim().replace(",", ".");
    n = /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
  } else return null;
  if (!Number.isFinite(n) || n <= 0 || n > MAX_QUANTIDADE) return null;
  const arredondada = Math.round(n * 1000) / 1000;
  return arredondada > 0 ? arredondada : null;
}

/**
 * Desconto digitado → inteiro gravado. Percentual: "10,5" → 1050 (0 a 100%).
 * Valor: "R$ 50,00" → 5000 centavos. Vazio = 0. null = inválido.
 */
export function lerDesconto(tipo: TipoDeDesconto, v: unknown): number | null {
  if (v === undefined || v === null || v === "") return 0;
  const n = typeof v === "number" ? v : typeof v === "string" ? parseReais(v.replace("%", "")) : NaN;
  if (!Number.isFinite(n) || n < 0) return null;
  if (tipo === "percentual") {
    const bp = Math.round(n * 100);
    return bp > CEM_POR_CENTO ? null : bp;
  }
  const centavos = Math.round(n * 100);
  return centavos > 2_147_483_647 ? null : centavos;
}

export interface ContaDoItem {
  unitPriceCents: number;
  /** Número, ou o texto que o Decimal do Prisma vira no JSON. */
  quantity: number | string;
  discountType: string;
  discountValue: number;
}

/** Bruto (preço × quantidade) menos o desconto, nunca abaixo de zero. */
export function totalDoItem(i: ContaDoItem): number {
  const bruto = Math.round(i.unitPriceCents * Number(i.quantity));
  const desconto =
    i.discountType === "valor"
      ? i.discountValue
      : Math.round((bruto * Math.min(i.discountValue, CEM_POR_CENTO)) / CEM_POR_CENTO);
  return Math.max(0, bruto - Math.max(0, desconto));
}

export interface ResumoDosItens {
  quantidade: number;
  totalCents: number;
  /** Soma dos itens de cobrança única. */
  unicoCents: number;
  /** Receita mensal recorrente: mensal inteiro + anual ÷ 12. */
  mrrCents: number;
  /** MRR × 12. */
  arrCents: number;
  temRecorrencia: boolean;
}

export function resumoDosItens(itens: { totalCents: number; recurrence: string }[]): ResumoDosItens {
  let totalCents = 0;
  let unicoCents = 0;
  let mensal = 0;
  let anual = 0;
  for (const i of itens) {
    totalCents += i.totalCents;
    if (i.recurrence === "mensal") mensal += i.totalCents;
    else if (i.recurrence === "anual") anual += i.totalCents;
    else unicoCents += i.totalCents;
  }
  const mrrCents = mensal + Math.round(anual / 12);
  return {
    quantidade: itens.length,
    totalCents,
    unicoCents,
    mrrCents,
    arrCents: mrrCents * 12,
    temRecorrencia: mensal > 0 || anual > 0 || itens.some((i) => i.recurrence !== "unico"),
  };
}

/** Texto do cartão: "3 produtos · Plano Pro +2". "" sem itens. */
export function resumoDosProdutos(nomes: string[]): string {
  if (nomes.length === 0) return "";
  const conta = nomes.length === 1 ? "1 produto" : `${nomes.length} produtos`;
  const resto = nomes.length > 1 ? ` +${nomes.length - 1}` : "";
  return `${conta} · ${nomes[0]}${resto}`;
}

/** "R$ 1.234,56" com espaço comum (o toLocaleString põe espaço inquebrável). */
export const moeda = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" }).replace(/ /g, " ");

/** "10,5%" / "R$ 50,00"; "" sem desconto. */
export function textoDoDesconto(tipo: string, valor: number): string {
  if (!valor) return "";
  if (tipo === "valor") return moeda(valor);
  return `${(valor / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

/** "1,5" para mostrar uma quantidade. */
export function textoDaQuantidade(q: number | string): string {
  return Number(q).toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

/** O que o servidor devolve de um item (Decimal já como número). */
export interface ItemDoNegocio {
  id: string;
  productId: string | null;
  name: string;
  sku: string;
  unit: string;
  recurrence: Recorrencia;
  unitPriceCents: number;
  quantity: number;
  discountType: TipoDeDesconto;
  discountValue: number;
  totalCents: number;
  position: number;
}

/** O que o servidor devolve de um produto do catálogo. */
export interface ProdutoDoCatalogo {
  id: string;
  name: string;
  sku: string;
  description: string;
  priceCents: number;
  currency: string;
  unit: string;
  recurrence: Recorrencia;
  category: string;
  archivedAt: string | null;
}
