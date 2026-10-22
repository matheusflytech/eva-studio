"use client";

import * as React from "react";

// Preferência pequena do usuário guardada no navegador (visão, resumo
// recolhido). Lida com useSyncExternalStore: sem setState em efeito e sem
// diferença entre servidor e navegador na primeira pintura.

const EVENTO = "eva:preferencia";
const memoria = new Map<string, string>();

function ler(chave: string, padrao: string): string {
  try {
    const v = localStorage.getItem(chave);
    if (v !== null) return v;
  } catch {
    // sem armazenamento: vale a memória da página
  }
  return memoria.get(chave) ?? padrao;
}

function assinar(avisar: () => void) {
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", avisar);
  };
}

export function usePreferencia<T extends string>(chave: string, padrao: T, validos: readonly T[]): [T, (v: T) => void] {
  const bruto = React.useSyncExternalStore(
    assinar,
    () => ler(chave, padrao),
    () => padrao
  );
  const valor = (validos as readonly string[]).includes(bruto) ? (bruto as T) : padrao;
  const gravar = React.useCallback(
    (v: T) => {
      memoria.set(chave, v);
      try {
        localStorage.setItem(chave, v);
      } catch {
        // fica só em memória
      }
      window.dispatchEvent(new Event(EVENTO));
    },
    [chave]
  );
  return [valor, gravar];
}
