// Validação compartilhada pelas rotas de empresa. Fica fora do route.ts porque
// arquivo de rota do Next só pode exportar os métodos HTTP.

/** CNPJ só com dígitos e com os dois dígitos verificadores certos. */
export function cnpjValido(digitos: string): boolean {
  if (!/^\d{14}$/.test(digitos) || /^(\d)\1{13}$/.test(digitos)) return false;
  const dv = (base: string) => {
    const pesos = base.length === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split("").reduce((s, d, i) => s + Number(d) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const d1 = dv(digitos.slice(0, 12));
  const d2 = dv(digitos.slice(0, 12) + d1);
  return digitos.endsWith(`${d1}${d2}`);
}

/**
 * Número de funcionários: undefined = não veio; null = limpar; "invalido" =
 * recusar (texto, fração, negativo).
 */
export function tamanhoDaEmpresa(v: unknown): number | null | undefined | "invalido" {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = typeof v === "string" ? Number(v.trim()) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 2_147_483_647) return "invalido";
  return n;
}
