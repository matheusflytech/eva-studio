"use client";

import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import { useGSAP } from "@gsap/react";

// GSAP do quadro de negócios v4, registrado uma vez. Só no navegador: os
// componentes que usam isto são client e animam dentro de useGSAP/efeitos.
gsap.registerPlugin(useGSAP, Flip);

/** Curvas do quadro: entrada suave, voo dos cartões com pouso firme. */
export const CURVA = { entrada: "power2.out", voo: "power3.out", saida: "power2.in" } as const;

/** Quem pediu menos movimento ao sistema só vê esmaecer. */
export function reduzMovimento(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export { gsap, Flip, useGSAP };
