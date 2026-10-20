import type { TipoDeSaida } from "./saidas";

/**
 * Cor de cada tipo de saída, a mesma no ponto do cartão, no rótulo ao lado
 * dele e na pílula no meio da ligação. Só tokens: funciona nos dois temas.
 * Sim/Respondeu = sucesso, Não = perigo, Não respondeu certo = aviso,
 * opção de menu = acento.
 */
export const ESTILO_DA_SAIDA: Record<TipoDeSaida, { texto: string; ponto: string }> = {
  padrao: { texto: "text-text-tertiary", ponto: "!bg-border-strong" },
  sim: { texto: "text-success", ponto: "!bg-success" },
  respondeu: { texto: "text-success", ponto: "!bg-success" },
  nao: { texto: "text-danger", ponto: "!bg-danger" },
  invalida: { texto: "text-warning", ponto: "!bg-warning" },
  opcao: { texto: "text-accent-fg", ponto: "!bg-accent-solid" },
};
