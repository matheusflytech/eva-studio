"use client";

import * as React from "react";
import { CURVA, Flip, reduzMovimento } from "@/components/crm/negocios/animacao/gsap";

// Arrastar e redimensionar os cartões do painel no modo de edição. A ordem e a
// largura continuam no estado do painel (salvo sozinho); aqui só se decide a
// mudança pelo ponteiro e o GSAP Flip anima os cartões até o lugar novo.

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

/** Largura em colunas pela largura arrastada, presa entre 1 e as colunas da grade. */
export function colunasPelaLargura(largura: number, coluna: number, vao: number, total: number): number {
  return Math.min(total, Math.max(1, Math.round((largura + vao) / (coluna + vao))));
}

export function useArrastarCartoes<T extends { id: string; largura: number }>(
  grade: React.RefObject<HTMLElement | null>,
  widgets: T[] | null,
  setWidgets: React.Dispatch<React.SetStateAction<T[] | null>>
) {
  const estado = React.useRef<Flip.FlipState | null>(null);
  const [arrastando, setArrastando] = React.useState<string | null>(null);

  // Foto dos cartões antes da mudança; depois do render, o Flip anima a diferença.
  const comFlip = React.useCallback(
    (mudar: () => void) => {
      if (grade.current && !reduzMovimento()) estado.current = Flip.getState(grade.current.querySelectorAll("[data-cartao]"));
      mudar();
    },
    [grade]
  );

  React.useLayoutEffect(() => {
    const s = estado.current;
    if (!s) return;
    estado.current = null;
    Flip.from(s, { duration: 0.35, ease: CURVA.entrada, nested: true });
  }, [widgets]);

  const cartaoSob = (x: number, y: number) =>
    (document.elementFromPoint(x, y)?.closest("[data-cartao]") as HTMLElement | null)?.dataset.cartao ?? null;

  function arrastar(id: string, e: React.PointerEvent) {
    e.preventDefault();
    setArrastando(id);
    let ultimo: string | null = null;
    const mover = (ev: PointerEvent) => {
      const alvo = cartaoSob(ev.clientX, ev.clientY);
      if (!alvo || alvo === id || alvo === ultimo) return;
      ultimo = alvo;
      comFlip(() => setWidgets((ws) => (ws ? moverPara(ws, id, alvo) : ws)));
    };
    const soltar = () => {
      setArrastando(null);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
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
    const vao = parseFloat(css.columnGap) || 0;
    const coluna = (g.clientWidth - vao * (total - 1)) / total;
    const inicio = e.clientX;
    const larguraInicial = el.getBoundingClientRect().width;
    setArrastando(id);
    const mover = (ev: PointerEvent) => {
      const n = colunasPelaLargura(larguraInicial + ev.clientX - inicio, coluna, vao, total);
      setWidgets((ws) => {
        const atual = ws?.find((w) => w.id === id);
        // Em 2 colunas, "3" e "2" ocupam o mesmo; só muda quando a largura vista muda.
        if (!ws || !atual || Math.min(atual.largura, total) === n) return ws;
        if (grade.current && !reduzMovimento()) estado.current = Flip.getState(grade.current.querySelectorAll("[data-cartao]"));
        return ws.map((w) => (w.id === id ? { ...w, largura: n } : w));
      });
    };
    const soltar = () => {
      setArrastando(null);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
  }

  return { arrastando, arrastar, redimensionar };
}
