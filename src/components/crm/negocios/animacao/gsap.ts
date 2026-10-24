"use client";

import { gsap } from "gsap";
import { Flip } from "gsap/Flip";
import { CustomEase } from "gsap/CustomEase";
import { useGSAP } from "@gsap/react";

// GSAP do quadro de negócios v4, registrado uma vez. Só no navegador: os
// componentes que usam isto são client e animam dentro de useGSAP/efeitos.
gsap.registerPlugin(useGSAP, Flip, CustomEase);

// As mesmas curvas dos tokens de CSS (--ease-out e --ease-in em globals.css).
CustomEase.create("eva-out", "0.32,0.72,0,1");
CustomEase.create("eva-in", "0.4,0,1,1");

/** Curvas do quadro: entrar e voar com --ease-out, sair com --ease-in. */
export const CURVA = { entrada: "eva-out", voo: "eva-out", saida: "eva-in" } as const;

/** Quem pediu menos movimento ao sistema só vê esmaecer. */
export function reduzMovimento(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export { gsap, Flip, useGSAP };
