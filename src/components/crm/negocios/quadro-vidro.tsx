"use client";

import * as React from "react";

/** Dentro do quadro de negócios o cartão é de vidro (CSS `.vidro` em globals.css); fora dele (editor, prévia) segue o painel sólido. */
export const VidroContexto = React.createContext(false);

// Mapa da lente: cinza neutro no meio e, nas quatro bordas, um empurrão para dentro
// (R e G lidos pelo feDisplacementMap). Esticado ao tamanho de cada cartão.
const MAPA_DA_LENTE = "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='128' height='128'><defs><linearGradient id='t' x1='0' y1='0' x2='0' y2='1'><stop offset='0' stop-color='rgb(128,0,128)'/><stop offset='.18' stop-color='rgb(128,0,128)' stop-opacity='0'/></linearGradient><linearGradient id='b' x1='0' y1='1' x2='0' y2='0'><stop offset='0' stop-color='rgb(128,255,128)'/><stop offset='.18' stop-color='rgb(128,255,128)' stop-opacity='0'/></linearGradient><linearGradient id='l' x1='0' y1='0' x2='1' y2='0'><stop offset='0' stop-color='rgb(0,128,128)'/><stop offset='.14' stop-color='rgb(0,128,128)' stop-opacity='0'/></linearGradient><linearGradient id='r' x1='1' y1='0' x2='0' y2='0'><stop offset='0' stop-color='rgb(255,128,128)'/><stop offset='.14' stop-color='rgb(255,128,128)' stop-opacity='0'/></linearGradient></defs><rect width='128' height='128' fill='rgb(128,128,128)'/><rect width='128' height='128' fill='url(%23t)'/><rect width='128' height='128' fill='url(%23b)'/><rect width='128' height='128' fill='url(%23l)'/><rect width='128' height='128' fill='url(%23r)'/></svg>";

/**
 * Liga o vidro no quadro e define a lente. A lente (filtro SVG dentro do backdrop-filter) só
 * funciona no Chromium: nos outros fica o vidro fosco, que já é o grosso do efeito. O CSS só
 * a usa no cartão sob o ponteiro ou arrastado, para não pesar com centenas de cartões.
 */
export function QuadroVidro({ children }: { children: React.ReactNode }) {
  React.useEffect(() => {
    if (!/Chrome\//.test(navigator.userAgent)) return;
    const html = document.documentElement;
    html.dataset.refracao = "sim";
    return () => {
      delete html.dataset.refracao;
    };
  }, []);

  return (
    <VidroContexto.Provider value>
      {children}
      <svg width="0" height="0" className="absolute" aria-hidden="true" focusable="false">
        <filter id="eva-vidro-lente" x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feImage href={MAPA_DA_LENTE} x="0" y="0" width="100%" height="100%" preserveAspectRatio="none" result="mapa" />
          <feDisplacementMap in="SourceGraphic" in2="mapa" scale="34" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>
    </VidroContexto.Provider>
  );
}
