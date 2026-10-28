"use client";

import * as React from "react";
import { CURVA, Flip, reduzMovimento } from "@/components/crm/negocios/animacao/gsap";

// Arrastar e redimensionar os cartões do painel. A ordem e o tamanho
// continuam no estado do painel (salvo sozinho); aqui só se decide a mudança
// pelo ponteiro (ou pelo teclado) e o GSAP Flip anima os cartões até o lugar novo.

export const ALTURA_MAXIMA = 3;

/** Move `id` para a posição de `alvo` (o resto escorrega). */
export function moverPara<T extends { id: string }>(lista: T[], id: string, alvo: string): T[] {
  const de = lista.findIndex((w) => w.id === id);
  const para = lista.findIndex((w) => w.id === alvo);
  if (de < 0 || para < 0 || de === para) return lista;
  const copia = [...lista];
  const [item] = copia.splice(de, 1);
  copia.splice(para, 0, item);
  return copia;
}

/** Troca `id` com o vizinho de antes (-1) ou de depois (+1); na ponta, não mexe. */
export function moverComTeclado<T extends { id: string }>(lista: T[], id: string, delta: -1 | 1): T[] {
  const i = lista.findIndex((w) => w.id === id);
  const alvo = lista[i + delta];
  return i < 0 || !alvo ? lista : moverPara(lista, id, alvo.id);
}

/** Largura em colunas pela largura arrastada, presa entre 1 e as colunas da grade. */
export function colunasPelaLargura(largura: number, coluna: number, vao: number, total: number): number {
  return Math.min(total, Math.max(1, Math.round((largura + vao) / (coluna + vao))));
}

/** Altura em linhas pela altura arrastada, presa entre 1 e `max`. */
export function linhasPelaAltura(altura: number, linha: number, vao: number, max = ALTURA_MAXIMA): number {
  return Math.min(max, Math.max(1, Math.round((altura + vao) / (linha + vao))));
}

export function useArrastarCartoes<T extends { id: string; largura: number; altura?: number }>(
  grade: React.RefObject<HTMLElement | null>,
  widgets: T[] | null,
  setWidgets: React.Dispatch<React.SetStateAction<T[] | null>>,
  /** Chamado ao soltar, quando algo mudou, com a lista de antes (para o Desfazer). */
  aoSoltar?: (antes: T[], o: "movido" | "tamanho") => void
) {
  const estado = React.useRef<Flip.FlipState | null>(null);
  const [arrastando, setArrastando] = React.useState<string | null>(null);
  const atual = React.useRef(widgets);
  React.useEffect(() => {
    atual.current = widgets;
  });

  const fotografar = React.useCallback(() => {
    if (grade.current && !reduzMovimento()) estado.current = Flip.getState(grade.current.querySelectorAll("[data-cartao]"));
  }, [grade]);

  React.useLayoutEffect(() => {
    const s = estado.current;
    if (!s) return;
    estado.current = null;
    Flip.from(s, { duration: 0.35, ease: CURVA.entrada, nested: true });
  }, [widgets]);

  const cartaoSob = (x: number, y: number) =>
    (document.elementFromPoint(x, y)?.closest("[data-cartao]") as HTMLElement | null)?.dataset.cartao ?? null;

  /** Liga os ouvintes do ponteiro até soltar; ao soltar avisa se a lista mudou. */
  function acompanhar(id: string, o: "movido" | "tamanho", mover: (ev: PointerEvent) => void) {
    const antes = atual.current;
    setArrastando(id);
    const soltar = () => {
      setArrastando(null);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      // O estado mais novo só existe depois do último render: lê no próximo quadro.
      requestAnimationFrame(() => {
        if (antes && atual.current !== antes) aoSoltar?.(antes, o);
      });
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  }

  function arrastar(id: string, e: React.PointerEvent) {
    e.preventDefault();
    let ultimo: string | null = null;
    acompanhar(id, "movido", (ev) => {
      const alvo = cartaoSob(ev.clientX, ev.clientY);
      if (!alvo || alvo === id || alvo === ultimo) return;
      ultimo = alvo;
      fotografar();
      setWidgets((ws) => (ws ? moverPara(ws, id, alvo) : ws));
    });
  }

  function redimensionar(id: string, e: React.PointerEvent) {
    const el = (e.currentTarget as HTMLElement).closest("[data-cartao]") as HTMLElement | null;
    const g = grade.current;
    if (!el || !g) return;
    e.preventDefault();
    e.stopPropagation();
    const css = getComputedStyle(g);
    const total = css.gridTemplateColumns.split(" ").filter(Boolean).length;
    if (total < 2) return; // celular: uma coluna só
    const vaoX = parseFloat(css.columnGap) || 0;
    const vaoY = parseFloat(css.rowGap) || 0;
    const coluna = (g.clientWidth - vaoX * (total - 1)) / total;
    const linha = parseFloat(css.gridAutoRows) || 168;
    const caixa = el.getBoundingClientRect();
    const [x0, y0] = [e.clientX, e.clientY];
    acompanhar(id, "tamanho", (ev) => {
      const largura = colunasPelaLargura(caixa.width + ev.clientX - x0, coluna, vaoX, total);
      const altura = linhasPelaAltura(caixa.height + ev.clientY - y0, linha, vaoY);
      setWidgets((ws) => {
        const w = ws?.find((x) => x.id === id);
        // Em 2 colunas, "3" e "2" ocupam o mesmo; só muda quando o tamanho visto muda.
        if (!ws || !w || (Math.min(w.largura, total) === largura && (w.altura ?? 1) === altura)) return ws;
        fotografar();
        return ws.map((x) => (x.id === id ? { ...x, largura, altura } : x));
      });
    });
  }

  /** Muda a lista com animação (teclado, menu). */
  function animar(mudar: () => void) {
    fotografar();
    mudar();
  }

  return { arrastando, arrastar, redimensionar, animar };
}
