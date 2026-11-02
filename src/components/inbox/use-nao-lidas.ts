"use client";

import * as React from "react";
import { useSondagem } from "./use-sondagem";

/**
 * Quantas conversas estão esperando alguém olhar. A cada 20s e só com a aba à
 * vista: é um número de relance, não precisa ser instantâneo. Usado no menu
 * lateral do celular e nas abas do topo.
 */
export function useNaoLidas(): number {
  const [naoLidas, setNaoLidas] = React.useState(0);
  useSondagem(async () => {
    const res = await fetch("/api/inbox/summary");
    if (res.ok) setNaoLidas((await res.json()).naoLidas ?? 0);
  }, 20_000);
  return naoLidas;
}

/** "99+" no máximo, ou nada quando não há o que mostrar. */
export const rotuloDeNaoLidas = (n: number): string | undefined => (n > 0 ? (n > 99 ? "99+" : String(n)) : undefined);
