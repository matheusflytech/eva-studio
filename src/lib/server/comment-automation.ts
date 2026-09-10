import "server-only";

export interface CommentAutomationLike {
  id: string;
  mediaId: string;
  keyword: string;
  active: boolean;
  publicReply: string;
  dmMessage: string;
}

// Acha a automação de comentário mais específica que bate com um
// comentário — usada tanto pelo webhook de verdade quanto pelo simulador
// (mesma lógica exata nos dois, pra não haver ambiguidade sobre "o que vai
// acontecer"). Regra de prioridade: post específico + palavra-chave > só
// post específico > só palavra-chave > gatilho genérico (qualquer post,
// qualquer comentário).
export function matchCommentAutomation<T extends CommentAutomationLike>(
  automations: T[],
  input: { mediaId: string; text: string }
): T | null {
  const textLower = input.text.toLowerCase();

  const candidates = automations.filter((a) => {
    if (!a.active) return false;
    if (a.mediaId && a.mediaId !== input.mediaId) return false;
    if (!a.keyword) return true;
    const keywords = a.keyword.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
    return keywords.some((k) => textLower.includes(k));
  });

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const scoreOf = (a: T) => (a.mediaId ? 2 : 0) + (a.keyword ? 1 : 0);
    return scoreOf(b) - scoreOf(a);
  });

  return candidates[0];
}
