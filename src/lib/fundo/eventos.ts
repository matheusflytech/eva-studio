// ---------------------------------------------------------------------------
// Avisos do app para a casca: um pulso no fundo vivo e um evento na ilha.
//
// Qualquer tela chama `pulsar(elemento)` ou `avisarNaIlha({...})` sem saber
// onde o fundo e a ilha moram. Passa por CustomEvent na window, então não há
// contexto de React para montar nem nada para limpar.
// ---------------------------------------------------------------------------

export const EVENTO_PULSO = "eva:pulso";
export const EVENTO_ILHA = "eva:ilha";

export interface DetalheDoPulso {
  /** Ponto na tela (clientX/clientY). Sem ponto, a onda sai do centro. */
  x?: number;
  y?: number;
  forca: number;
}

export interface AvisoDaIlha {
  titulo: string;
  detalhe?: string;
  /** Iniciais ou texto curto no círculo à esquerda. */
  avatar?: string;
  acao?: { rotulo: string; href?: string; aoClicar?: () => void };
  /** Quanto tempo a ilha fica aberta (ms). Padrão 4000. */
  duracao?: number;
}

/** Solta uma onda no fundo a partir do elemento (ou do centro da tela). */
export function pulsar(alvo?: Element | null, forca = 1) {
  if (typeof window === "undefined") return;
  const detalhe: DetalheDoPulso = { forca };
  if (alvo) {
    const r = alvo.getBoundingClientRect();
    detalhe.x = r.left + r.width / 2;
    detalhe.y = r.top + r.height / 2;
  }
  window.dispatchEvent(new CustomEvent<DetalheDoPulso>(EVENTO_PULSO, { detail: detalhe }));
}

/** Abre a ilha com um acontecimento e uma ação opcional (Desfazer, Abrir...). */
export function avisarNaIlha(aviso: AvisoDaIlha) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<AvisoDaIlha>(EVENTO_ILHA, { detail: aviso }));
}
