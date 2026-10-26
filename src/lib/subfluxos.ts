// ---------------------------------------------------------------------------
// Vários fluxos por bot (S4). O fluxo do agente (AgentFlow) é o principal; os
// extras moram em AgentSubflow. O bloco "Ir para fluxo" guarda o id do
// destino em `targetFlowId` ("main" = o principal), e a palavra-chave de um
// fluxo leva a conversa para ele de qualquer ponto. Sem "server-only": o
// builder usa as mesmas regras.
// ---------------------------------------------------------------------------

export const FLUXO_PRINCIPAL = "main";
export const MAX_FLUXOS = 30;
export const MAX_PALAVRAS = 20;

/** "  Segunda Via! " → "segunda via": sem acento, maiúscula, espaço sobrando ou pontuação nas pontas. */
export function normalizarPalavra(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/** Palavras-chave como chegam da tela ou da API: texto, sem repetida nem vazia, no máximo 20. */
export function sanearPalavras(bruto: unknown): string[] {
  if (!Array.isArray(bruto)) return [];
  const vistas = new Set<string>();
  const out: string[] = [];
  for (const v of bruto) {
    if (typeof v !== "string") continue;
    const p = v.trim().slice(0, 60);
    const n = normalizarPalavra(p);
    if (!n || vistas.has(n)) continue;
    vistas.add(n);
    out.push(p);
    if (out.length >= MAX_PALAVRAS) break;
  }
  return out;
}

/**
 * Fluxo cuja palavra-chave é a mensagem inteira. Mensagem que só contém a
 * palavra não conta: "quero falar do boleto" no meio de uma pergunta não pode
 * tirar a conversa de onde está.
 */
export function fluxoDaPalavra(texto: string | undefined, fluxos: { id: string; keywords: string[] }[]): string | null {
  const t = normalizarPalavra(texto ?? "");
  if (!t) return null;
  return fluxos.find((f) => f.keywords.some((k) => normalizarPalavra(k) === t))?.id ?? null;
}
