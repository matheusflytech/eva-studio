/**
 * Contraste WCAG 2.x entre duas cores sólidas em hex (#rgb ou #rrggbb).
 *
 * Usado pelos testes (garante AA dos pares de tokens nos dois temas) e pela
 * página /design-system, que mostra o número ao lado de cada amostra.
 */

export function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) throw new Error(`Cor inválida: ${hex}`);
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Luminância relativa (WCAG 2.x, sRGB). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Razão de contraste entre 1 e 21. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [claro, escuro] = la > lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (escuro + 0.05);
}

export type ContrastLevel = "AAA" | "AA" | "AA texto grande" | "falha";

/** Nível alcançado para texto de corpo (4,5 AA; 7 AAA; 3 só texto grande/UI). */
export function contrastLevel(ratio: number): ContrastLevel {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  if (ratio >= 3) return "AA texto grande";
  return "falha";
}

/** Arredonda para baixo em 2 casas: 4,499 não pode aparecer como 4,50. */
export function formatRatio(ratio: number): string {
  return (Math.floor(ratio * 100) / 100).toFixed(2).replace(".", ",");
}
