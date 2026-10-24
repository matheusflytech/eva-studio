/**
 * Formatação usada pelos componentes do design system (pt-BR). Pura e
 * testada; os componentes reexportam o que faz sentido.
 */

const moeda = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const umaCasa = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** 12400 → "R$ 12.400" (sem centavos: quadro e totais). */
export function formatMoney(valor: number): string {
  return moeda.format(valor);
}

/** 12.4 → "+12,4%"; -3 → "−3,0%" (sinal de menos tipográfico); 0 → "0,0%". */
export function formatDelta(delta: number): string {
  const v = umaCasa.format(Math.abs(delta));
  if (delta > 0) return `+${v}%`;
  if (delta < 0) return `−${v}%`;
  return `${v}%`;
}

/** "Ana Maria Souza" → "AS"; "ana" → "A"; "" → "?". */
export function initials(nome: string): string {
  // Etiquetas como "[DEMO]" e pontuação não viram inicial.
  const semEtiqueta = nome.replace(/\[[^\]]*\]/g, " ");
  const partes = (semEtiqueta.trim() ? semEtiqueta : nome)
    .split(/\s+/)
    .map((p) => p.match(/[\p{L}\p{N}]/u)?.[0] ?? "")
    .filter(Boolean);
  if (partes.length === 0) return "?";
  const primeira = partes[0];
  const ultima = partes.length > 1 ? partes[partes.length - 1] : "";
  return (primeira + ultima).toUpperCase();
}

export interface FilterOption {
  value: string;
  label: string;
  /** Texto secundário à direita (ex.: quantidade de registros). */
  hint?: string;
}

/** Filtra opções pelo texto, ignorando acento e caixa ("joao" acha "João"). */
export function filterOptions(options: readonly FilterOption[], busca: string): FilterOption[] {
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = norm(busca.trim());
  if (!q) return [...options];
  return options.filter((o) => norm(o.label).includes(q));
}
