"use client";

import * as React from "react";

// Lista de ids guardada no navegador (colunas escolhidas, colunas recolhidas
// do quadro), por chave. useSyncExternalStore: sem setState em efeito e sem
// diferença entre servidor e navegador na primeira pintura. Vale para as
// visões de sistema (e sem a tabela de visões); as salvas guardam no banco.

const EVENTO = "eva:lista-salva";
const memoria = new Map<string, string>();

function ler(chave: string): string | null {
  try {
    const v = localStorage.getItem(chave);
    if (v !== null) return v;
  } catch {
    // sem armazenamento: vale a memória da página
  }
  return memoria.get(chave) ?? null;
}

function assinar(avisar: () => void) {
  window.addEventListener(EVENTO, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO, avisar);
    window.removeEventListener("storage", avisar);
  };
}

/**
 * [ids, gravar]. `validar` recebe o texto cru (ou null) e devolve a lista
 * válida; precisa ser estável (useCallback) para não recalcular à toa.
 */
export function useListaSalva(chave: string, validar: (bruto: string | null) => string[]): [string[], (ids: string[]) => void] {
  const bruto = React.useSyncExternalStore(
    assinar,
    () => ler(chave),
    () => null
  );
  const lista = React.useMemo(() => validar(bruto), [bruto, validar]);
  const gravar = React.useCallback(
    (ids: string[]) => {
      const texto = JSON.stringify(ids);
      memoria.set(chave, texto);
      try {
        localStorage.setItem(chave, texto);
      } catch {
        // fica só em memória
      }
      window.dispatchEvent(new Event(EVENTO));
    },
    [chave]
  );
  return [lista, gravar];
}
