import type { Edge } from "@xyflow/react";
import type { FlowNodeData } from "./flow-node";
import { SAIDA_INVALIDA } from "@/lib/capture-validation";

// ---------------------------------------------------------------------------
// Saídas de cada bloco: quais pontos de ligação ele tem, em que ordem e com
// que rótulo. Uma fonte só para o cartão (onde desenhar cada ponto), para a
// ligação (o rótulo no meio dela), para o auto-layout (Sim em cima, opções na
// ordem), para a validação (ramo faltando, saída que não existe) e para quem
// acrescenta bloco depois de outro (qual saída usar).
//
// id null = a saída "sem nome" (a padrão). É assim que o motor
// (flow-engine.ts) procura a continuação normal de um bloco.
// ---------------------------------------------------------------------------

export type TipoDeSaida = "padrao" | "sim" | "nao" | "opcao" | "respondeu" | "invalida" | "erro";

/**
 * Saída "Erro" do bloco de IA: por onde a conversa segue quando o provedor
 * falha (chave errada, fora do ar, limite). Sem ligação nela, a conversa fica
 * no bloco de IA, como antes.
 */
export const SAIDA_ERRO = "erro";

/** Saída do Bloco quando o cliente não responde no prazo (replyTimeoutMinutes). */
export const SAIDA_SEM_RESPOSTA = "sem_resposta";

export interface Saida {
  id: string | null;
  rotulo: string | null;
  tipo: TipoDeSaida;
}

const FERRAMENTAS = new Set(["tool-http", "tool-knowledge", "tool-mcp", "tool-crm"]);

export const ehFerramenta = (iconKey: string) => FERRAMENTAS.has(iconKey);

/** Captura, ou Bloco que espera a resposta: os dois usam os campos de pergunta. */
export function esperaResposta(data: FlowNodeData): boolean {
  return data.iconKey === "capture" || (data.iconKey === "studio-block" && !!data.waitForReply);
}

/** Pergunta que valida a resposta (tem tipo e não é menu de botões). Mesma regra do motor. */
export function capturaComValidacao(data: FlowNodeData): boolean {
  return esperaResposta(data) && (data.options ?? []).length === 0 && !!data.captureField && data.captureField !== "text";
}

/** As saídas do bloco, de cima para baixo. Lista vazia = bloco sem saída. */
export function saidasDoBloco(data: FlowNodeData): Saida[] {
  if (ehFerramenta(data.iconKey) || data.iconKey === "end" || data.hasSource === false) return [];
  if (data.iconKey === "condition") {
    return [
      { id: "true", rotulo: "Sim", tipo: "sim" },
      { id: "false", rotulo: "Não", tipo: "nao" },
    ];
  }
  if (data.iconKey === "ai-agent") {
    // "Terminou" sem id: ligações antigas do bloco continuam valendo.
    return [
      { id: null, rotulo: "Terminou", tipo: "padrao" },
      ...(data.aiExits ?? []).map((s, i) => ({ id: s.id, rotulo: s.name.trim() || `Saída ${i + 1}`, tipo: "opcao" as const })),
      { id: SAIDA_ERRO, rotulo: "Erro", tipo: "erro" },
    ];
  }
  // Bloco: as condições vêm primeiro (a primeira verdadeira ganha), depois o
  // que a pergunta decide.
  const condicoes: Saida[] =
    data.iconKey === "studio-block"
      ? (data.exitConditions ?? []).map((c, i) => ({ id: c.id, rotulo: c.label.trim() || `Condição ${i + 1}`, tipo: "opcao" }))
      : [];
  const semResposta: Saida[] =
    data.iconKey === "studio-block" && data.waitForReply && (data.replyTimeoutMinutes ?? 0) > 0
      ? [{ id: SAIDA_SEM_RESPOSTA, rotulo: "Não respondeu", tipo: "invalida" }]
      : [];
  const opcoes = esperaResposta(data) ? data.options ?? [] : [];
  if (opcoes.length > 0) {
    return [
      ...condicoes,
      ...opcoes.map((o, i) => ({ id: o.id, rotulo: o.label?.trim() || `Opção ${i + 1}`, tipo: "opcao" as const })),
      ...semResposta,
    ];
  }
  if (capturaComValidacao(data)) {
    // "Respondeu" fica sem id de propósito: ligações antigas desse bloco
    // continuam valendo como a saída normal.
    return [
      ...condicoes,
      { id: null, rotulo: "Respondeu", tipo: "respondeu" },
      { id: SAIDA_INVALIDA, rotulo: "Não respondeu certo", tipo: "invalida" },
      ...semResposta,
    ];
  }
  return [...condicoes, { id: null, rotulo: condicoes.length || semResposta.length ? "Nenhuma das condições" : null, tipo: "padrao" }, ...semResposta];
}

/** O bloco tem mais de uma saída, cada uma com nome (o motor exige o id certo na ligação). */
export function temSaidasNomeadas(data: FlowNodeData): boolean {
  const s = saidasDoBloco(data);
  return s.length > 1 || s.some((x) => x.id !== null);
}

const mesmaSaida = (handle: string | null | undefined, id: string | null) => (handle ?? null) === id;

/** Qual saída uma ligação usa; null se o id não existe no bloco. */
export function saidaDaLigacao(data: FlowNodeData, sourceHandle: string | null | undefined): Saida | null {
  const saidas = saidasDoBloco(data);
  // Bloco de saída única: o motor segue qualquer ligação dele, com ou sem id.
  if (!temSaidasNomeadas(data)) return saidas[0] ?? null;
  return saidas.find((s) => mesmaSaida(sourceHandle, s.id)) ?? null;
}

/** Posição da saída na lista (para ordenar ramos); saída desconhecida vai para o fim. */
export function ordemDaSaida(data: FlowNodeData, sourceHandle: string | null | undefined): number {
  const i = saidasDoBloco(data).findIndex((s) => mesmaSaida(sourceHandle, s.id));
  return i < 0 ? Number.MAX_SAFE_INTEGER : i;
}

/**
 * Por qual saída pendurar um bloco novo depois deste: a primeira que ainda
 * está livre (Sim antes de Não, opções na ordem). Se todas estiverem
 * ocupadas, a primeira. undefined = saída padrão (ligação sem id).
 */
export function saidaParaNovoBloco(data: FlowNodeData, nodeId: string, edges: Edge[]): string | undefined {
  const saidas = saidasDoBloco(data);
  if (saidas.length === 0) return undefined;
  const ocupada = (s: Saida) =>
    edges.some((e) => e.source === nodeId && e.targetHandle !== "tools" && mesmaSaida(e.sourceHandle, s.id));
  const livre = saidas.find((s) => !ocupada(s)) ?? saidas[0];
  return livre.id ?? undefined;
}
