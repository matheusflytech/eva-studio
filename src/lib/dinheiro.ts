// Leitura de valor em reais digitado na tela. Mesma regra de
// parseReais em lib/server/api-validacao.ts (que é server-only): o que a
// tela aceita é exatamente o que o servidor aceita.

/** "R$ 1.500,50" → 1500.5; "1500.50" → 1500.5; "1.500" → 1500. NaN se inválido. */
export function parseReais(texto: string): number {
  let s = texto.replace(/R\$|\s/gi, "");
  if (!s) return NaN;
  if (s.includes(",")) {
    // Vírgula é o decimal; pontos são milhar.
    s = s.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
    // "1.500" ou "1.500.000": só separadores de milhar.
    s = s.replace(/\./g, "");
  }
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Maior valor em reais que cabe na coluna (centavos em Int). */
export const MAX_REAIS = 21_474_836.47;

/** Valor digitado → reais, ou null se inválido/negativo/acima do teto. Vazio = 0. */
export function reaisDigitados(texto: string): number | null {
  if (!texto.trim()) return 0;
  const n = parseReais(texto);
  if (!Number.isFinite(n) || n < 0 || n > MAX_REAIS) return null;
  return n;
}
