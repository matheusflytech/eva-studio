"use client";

import type * as React from "react";
import { CURVA, gsap, reduzMovimento, useGSAP } from "./gsap";

/** Funis que já entraram nesta aba (vale também ao ir à Lista e voltar). */
const vistos = new Set<string>();

/**
 * Entrada do quadro: os cartões sobem 8 px e aparecem, em cascata dentro de
 * cada coluna. Só na primeira carga de cada funil (`chave`, a primeira etapa
 * dele); filtros, recargas e "carregar mais" não animam de novo. Com menos
 * movimento, só esmaece.
 */
export function useEntradaDoQuadro(ref: React.RefObject<HTMLElement | null>, chave: string) {
  useGSAP(
    () => {
      const raiz = ref.current;
      if (!raiz || !chave || vistos.has(chave)) return;
      vistos.add(chave);
      const cartoes = gsap.utils.toArray<HTMLElement>("[data-deal-id]", raiz);
      if (!cartoes.length) return;
      if (reduzMovimento()) {
        gsap.from(cartoes, { autoAlpha: 0, duration: 0.15, clearProps: "opacity,visibility" });
        return;
      }
      // Posição de cada cartão na própria coluna: as colunas descem juntas.
      const posicao = new Map<Element, number>();
      const porColuna = new Map<Element | null, number>();
      for (const el of cartoes) {
        const i = porColuna.get(el.parentElement) ?? 0;
        posicao.set(el, i);
        porColuna.set(el.parentElement, i + 1);
      }
      gsap.from(cartoes, {
        y: 8,
        autoAlpha: 0,
        duration: 0.35,
        ease: CURVA.entrada,
        stagger: (_i: number, el: Element) => (posicao.get(el) ?? 0) * 0.03,
        clearProps: "transform,opacity,visibility",
      });
    },
    { dependencies: [chave], scope: ref }
  );
}
