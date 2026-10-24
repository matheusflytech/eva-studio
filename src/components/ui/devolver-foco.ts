"use client";

import * as React from "react";

/**
 * Ao fechar um Dialog do Radix, o foco volta para quem abriu. O Radix só
 * devolve ao Dialog.Trigger; aberto por um botão comum (estado controlado,
 * o caso mais comum aqui), o foco caía no body e o teclado perdia o lugar.
 */
export function useDevolverFoco() {
  const quemAbriu = React.useRef<HTMLElement | null>(null);
  return {
    // Roda antes de o foco entrar no diálogo: o ativo ainda é quem abriu.
    onOpenAutoFocus: () => {
      quemAbriu.current = document.activeElement as HTMLElement | null;
    },
    onCloseAutoFocus: (e: Event) => {
      const alvo = quemAbriu.current;
      if (alvo && alvo !== document.body && alvo.isConnected) {
        e.preventDefault();
        alvo.focus({ preventScroll: true });
      }
    },
  };
}
