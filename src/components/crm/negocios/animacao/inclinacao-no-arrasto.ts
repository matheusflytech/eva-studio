"use client";

import * as React from "react";
import { CURVA, gsap, reduzMovimento, useGSAP } from "./gsap";

/** Inclinação máxima, em graus, e quanto o cartão gira por px/ms do ponteiro. */
const GIRO_MAXIMO = 4;
const GIRO_POR_VELOCIDADE = 4;
/** Sem mexer o ponteiro por este tempo, o cartão volta a ficar reto. */
const PARADO_MS = 120;

/**
 * Cartão no DragOverlay: escala 1,03 e gira até ±4° na direção do movimento,
 * lendo a velocidade do ponteiro. Vai no wrapper interno do overlay, nunca no
 * nó que o dnd-kit posiciona (nem no cartão original). Com menos movimento,
 * nada gira. Devolve um callback ref: o DragOverlay monta o filho um render
 * depois do início do arrasto, então o hook espera o elemento aparecer.
 */
export function useInclinacaoNoArrasto(): (el: HTMLElement | null) => void {
  const [el, setEl] = React.useState<HTMLElement | null>(null);
  useGSAP(
    () => {
      if (!el || reduzMovimento()) return;
      gsap.to(el, { scale: 1.03, duration: 0.18, ease: CURVA.entrada });
      const girar = gsap.quickTo(el, "rotation", { duration: 0.3, ease: CURVA.voo });
      let ultimo: { x: number; t: number } | null = null;
      let parado: number | undefined;
      const aoMover = (e: PointerEvent) => {
        const t = performance.now();
        if (ultimo && t > ultimo.t) {
          const velocidade = (e.clientX - ultimo.x) / (t - ultimo.t);
          girar(gsap.utils.clamp(-GIRO_MAXIMO, GIRO_MAXIMO, velocidade * GIRO_POR_VELOCIDADE));
        }
        ultimo = { x: e.clientX, t };
        window.clearTimeout(parado);
        parado = window.setTimeout(() => girar(0), PARADO_MS);
      };
      window.addEventListener("pointermove", aoMover);
      return () => {
        window.removeEventListener("pointermove", aoMover);
        window.clearTimeout(parado);
      };
    },
    { dependencies: [el], revertOnUpdate: true }
  );
  return setEl;
}
