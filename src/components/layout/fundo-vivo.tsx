"use client";

import * as React from "react";
import { CampoDeCurvas, type OpcoesDoCampo } from "@/lib/fundo/campo-de-curvas";
import { EVENTO_PULSO, type DetalheDoPulso } from "@/lib/fundo/eventos";
import { useTheme } from "@/components/ui/theme";

// ---------------------------------------------------------------------------
// Fundo vivo da casca do app: curvas de nível que fluem devagar atrás de tudo
// e ondulam quando alguma tela chama `pulsar()`. A 30 quadros por segundo, em
// resolução reduzida, e parado com a aba escondida. Com "reduzir movimento" o
// desenho fica estático (o pulso ainda aparece, sem o fluxo contínuo).
// ---------------------------------------------------------------------------

export function FundoVivo({ className, escuro: forcarEscuro, ...opc }: OpcoesDoCampo & { className?: string; escuro?: boolean }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const { resolved } = useTheme();
  const escuro = forcarEscuro ?? resolved === "dark";
  const escuroRef = React.useRef(escuro);
  const campoRef = React.useRef<CampoDeCurvas | null>(null);
  const { forca, niveis, passo } = opc;

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const campo = new CampoDeCurvas(canvas, { forca, niveis, passo });
    campoRef.current = campo;
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)");
    let anterior = performance.now(), acumulado = 0, quadro = 0;

    const laco = (agora: number) => {
      const dt = Math.min(0.1, (agora - anterior) / 1000);
      anterior = agora;
      acumulado += dt;
      if (acumulado >= 1 / 30) {
        // Reduzir movimento: as curvas andam a um terço da velocidade, não param.
        campo.desenhar(reduz.matches ? acumulado * 0.35 : acumulado, escuroRef.current);
        acumulado = 0;
      }
      quadro = requestAnimationFrame(laco);
    };
    const ligar = () => {
      cancelAnimationFrame(quadro);
      if (!document.hidden) {
        anterior = performance.now();
        quadro = requestAnimationFrame(laco);
      }
    };
    const aoPulso = (e: Event) => {
      const { x, y, forca: f } = (e as CustomEvent<DetalheDoPulso>).detail;
      const r = canvas.getBoundingClientRect();
      campo.pulsar(x == null ? r.width / 2 : x - r.left, y == null ? r.height / 2 : y - r.top, f);
    };
    campo.desenhar(0, escuroRef.current);
    ligar();
    document.addEventListener("visibilitychange", ligar);
    window.addEventListener(EVENTO_PULSO, aoPulso);
    return () => {
      cancelAnimationFrame(quadro);
      document.removeEventListener("visibilitychange", ligar);
      window.removeEventListener(EVENTO_PULSO, aoPulso);
      campoRef.current = null;
    };
  }, [forca, niveis, passo]);

  // Trocou o tema: as curvas mudam de cor e uma onda grande sai do centro.
  React.useEffect(() => {
    if (escuroRef.current === escuro) return;
    escuroRef.current = escuro;
    const c = ref.current;
    if (c && campoRef.current) campoRef.current.pulsar(c.clientWidth / 2, c.clientHeight / 2, 3);
  }, [escuro]);

  return <canvas ref={ref} aria-hidden="true" className={className ?? "pointer-events-none absolute inset-0 h-full w-full"} />;
}
