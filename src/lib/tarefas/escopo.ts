import type { EscopoDeDados } from "@/lib/permissoes/catalogo";

// ---------------------------------------------------------------------------
// Minhas / Equipe / Todas na tela de tarefas.
//
// Tarefa não tem escopo próprio no papel: ela é atividade do negócio, então o
// teto é o escopo de NEGÓCIOS do papel (src/lib/server/escopo-dados.ts).
// "Só os meus" → só Minhas; "da equipe" → Minhas e Equipe; "todos" → as três.
// Pedir uma visão acima do teto cai na maior permitida (nunca mostra mais).
// ---------------------------------------------------------------------------

export const VISOES_DE_TAREFAS = ["minhas", "equipe", "todas"] as const;
export type VisaoDeTarefas = (typeof VISOES_DE_TAREFAS)[number];

export const ROTULO_DA_VISAO: Record<VisaoDeTarefas, string> = {
  minhas: "Minhas",
  equipe: "Equipe",
  todas: "Todas",
};

export function visoesPermitidas(escopo: EscopoDeDados | undefined): VisaoDeTarefas[] {
  if (escopo === "proprios") return ["minhas"];
  if (escopo === "equipe") return ["minhas", "equipe"];
  return ["minhas", "equipe", "todas"];
}

/** Visão pedida (aceita o antigo scope=todas) limitada ao teto do papel. */
export function resolverVisao(pedida: string | null | undefined, escopo: EscopoDeDados | undefined): VisaoDeTarefas {
  const permitidas = visoesPermitidas(escopo);
  const v = (VISOES_DE_TAREFAS as readonly string[]).includes(pedida ?? "") ? (pedida as VisaoDeTarefas) : "minhas";
  if (permitidas.includes(v)) return v;
  return permitidas[permitidas.length - 1];
}

/**
 * Responsáveis cujas tarefas a visão mostra. null = sem filtro (Todas, que
 * inclui as sem responsável).
 */
export function responsaveisDaVisao(visao: VisaoDeTarefas, userId: string, colegasDeEquipe: string[]): string[] | null {
  if (visao === "minhas") return [userId];
  if (visao === "equipe") return [...new Set([userId, ...colegasDeEquipe])];
  return null;
}

/** A pessoa pode mexer nesta tarefa? (Dentro do teto do papel.) */
export function tarefaNoEscopo(
  responsavel: string | null,
  escopo: EscopoDeDados | undefined,
  userId: string,
  colegasDeEquipe: string[]
): boolean {
  if (!escopo || escopo === "todos") return true;
  if (!responsavel) return false;
  if (escopo === "proprios") return responsavel === userId;
  return responsavel === userId || colegasDeEquipe.includes(responsavel);
}
