"use client";

import * as React from "react";
import { CURVA, Flip, gsap, reduzMovimento, useGSAP } from "./gsap";

/** Uma foto tirada e não usada em tanto tempo (ex.: recarga que não veio) é descartada. */
const VALIDADE_MS = 5000;

interface Foto {
  estado: Flip.FlipState;
  dealId?: string;
  em: number;
}

/**
 * Voo do cartão que muda de coluna (arrasto, "Mover para", painel, Desfazer):
 * `capturar()` fotografa os cartões antes das colunas mudarem; quando `colunas`
 * muda, o `Flip` leva cada cartão que mudou de lugar da posição antiga à nova
 * e os vizinhos se reacomodam. No soltar do arrasto, passe o wrapper do
 * overlay como `origem`: o cartão parte de onde foi solto. Os cartões e o
 * overlay têm `data-flip-id` igual ao id do negócio. Com menos movimento, o
 * cartão só aparece no lugar novo.
 */
export function useFlipDoQuadro(ref: React.RefObject<HTMLElement | null>, colunas: unknown) {
  const foto = React.useRef<Foto | null>(null);

  const capturar = React.useCallback(
    (dealId?: string, origem?: HTMLElement | null) => {
      const raiz = ref.current;
      if (!raiz) return;
      const cartoes = gsap.utils.toArray<HTMLElement>("[data-deal-id]", raiz).filter((el) => !(origem && el.dataset.dealId === dealId));
      foto.current = { estado: Flip.getState(origem ? [...cartoes, origem] : cartoes), dealId, em: Date.now() };
    },
    [ref]
  );

  useGSAP(
    () => {
      const f = foto.current;
      const raiz = ref.current;
      if (!f || !raiz) return;
      foto.current = null;
      if (Date.now() - f.em > VALIDADE_MS) return;
      if (reduzMovimento()) {
        const cartao = f.dealId ? raiz.querySelector(`[data-deal-id="${CSS.escape(f.dealId)}"]`) : null;
        if (cartao) gsap.from(cartao, { autoAlpha: 0, duration: 0.15, clearProps: "opacity,visibility" });
        return;
      }
      // Pouso firme, sem quique (curva --ease-out); os vizinhos se reacomodam junto.
      Flip.from(f.estado, {
        targets: gsap.utils.toArray<HTMLElement>("[data-deal-id]", raiz),
        duration: 0.4,
        ease: CURVA.entrada,
        prune: true,
      });
    },
    { dependencies: [colunas], scope: ref }
  );

  return capturar;
}
