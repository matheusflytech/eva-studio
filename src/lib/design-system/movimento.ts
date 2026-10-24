import type { Transition } from "framer-motion";

// Movimento do app em JS (framer-motion), par dos tokens de CSS em globals.css
// (--ease-out, --dur-*). Plano v7, B1/B5. Um motor por tipo de trabalho:
// CSS para estados (hover, aberto/fechado, entrada de tela); GSAP para o quadro
// (Flip, voo do painel); framer-motion para arrastar e molas de layout
// (notificação, pílula do menu, canvas). Sem dependência nova.

/**
 * A mola do app: sem quique, ~0,35 s. Arrastar e soltar, reordenar, painéis,
 * a pílula do menu. Interrompível por natureza (mola retoma do ponto atual).
 */
export const MOLA: Transition = { type: "spring", duration: 0.35, bounce: 0 };

/** Esmaecer curto com a curva de entrada do app (--ease-out). */
export const ESMAECER: Transition = { duration: 0.18, ease: [0.32, 0.72, 0, 1] };
