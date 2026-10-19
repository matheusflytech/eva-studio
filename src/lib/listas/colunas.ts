// ---------------------------------------------------------------------------
// Colunas escolhidas de uma lista ("Editar colunas"): quais aparecem e em que
// ordem. Até a L4 (visões salvas) ficam no navegador, por usuário e contrato.
// Puro: a tela guarda o array de ids e usa estas funções para validar o que
// veio do armazenamento, ligar/desligar e mover.
// ---------------------------------------------------------------------------

/** Chave no localStorage: uma por lista, contrato e usuário. */
export function chaveDasColunas(lista: string, contrato: string | null, usuario: string): string {
  return `eva:colunas:${lista}:${contrato ?? "-"}:${usuario || "-"}`;
}

/**
 * Colunas salvas → lista válida. Tira id desconhecido e repetido; as fixas
 * (ex.: "nome") ficam sempre, na frente; nada salvo (ou lixo) = o padrão.
 */
export function colunasValidas(salvas: unknown, disponiveis: readonly string[], padrao: readonly string[], fixas: readonly string[] = []): string[] {
  let bruto: unknown = salvas;
  if (typeof bruto === "string") {
    try {
      bruto = JSON.parse(bruto);
    } catch {
      bruto = null;
    }
  }
  const conhecidas = new Set(disponiveis);
  const vistas = new Set<string>();
  const escolhidas: string[] = [];
  if (Array.isArray(bruto)) {
    for (const id of bruto) {
      if (typeof id !== "string" || !conhecidas.has(id) || vistas.has(id)) continue;
      vistas.add(id);
      escolhidas.push(id);
    }
  }
  const base = escolhidas.length ? escolhidas : padrao.filter((id) => conhecidas.has(id));
  const fixasPresentes = fixas.filter((id) => conhecidas.has(id));
  return [...fixasPresentes, ...base.filter((id) => !fixasPresentes.includes(id))];
}

/** Liga (no fim) ou desliga uma coluna. Coluna fixa não sai. */
export function alternarColuna(atuais: readonly string[], id: string, ligar: boolean, fixas: readonly string[] = []): string[] {
  if (ligar) return atuais.includes(id) ? [...atuais] : [...atuais, id];
  if (fixas.includes(id)) return [...atuais];
  return atuais.filter((c) => c !== id);
}

/** Move uma coluna uma posição (-1 = para cima/esquerda). Não passa por cima das fixas. */
export function moverColuna(atuais: readonly string[], id: string, passo: -1 | 1, fixas: readonly string[] = []): string[] {
  const i = atuais.indexOf(id);
  const j = i + passo;
  if (i < 0 || j < 0 || j >= atuais.length || fixas.includes(id) || fixas.includes(atuais[j])) return [...atuais];
  const novo = [...atuais];
  [novo[i], novo[j]] = [novo[j], novo[i]];
  return novo;
}
