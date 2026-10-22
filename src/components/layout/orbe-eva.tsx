"use client";

import * as React from "react";
import { ruido } from "@/lib/fundo/campo-de-curvas";

// ---------------------------------------------------------------------------
// Presença da Eva: esfera de partículas que gira devagar e pulsa quando a Eva
// está "falando" (prop `falando`). No lugar de ícone de brilho para IA.
// ---------------------------------------------------------------------------

const N = 1100;

export function OrbeEva({ falando = false, className }: { falando?: boolean; className?: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const falandoRef = React.useRef(falando);
  falandoRef.current = falando;

  React.useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const ouro = Math.PI * (3 - Math.sqrt(5));
    const pts = Array.from({ length: N }, (_, k) => {
      const y = 1 - (k / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = ouro * k;
      return [Math.cos(th) * r, y, Math.sin(th) * r] as const;
    });
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)");
    let t = 0, amp = 0, anterior = performance.now(), quadro = 0;

    const desenha = (agora: number) => {
      const dt = reduz.matches ? 0 : Math.min(0.1, (agora - anterior) / 1000);
      anterior = agora;
      t += dt;
      amp += ((falandoRef.current ? 1 : 0) - amp) * Math.min(1, dt * 3 || 1);
      const dpr = 1.5, w = Math.round(cv.clientWidth * dpr), h = Math.round(cv.clientHeight * dpr);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }
      const R = Math.min(w, h) * 0.4, rot = t * 0.25, cr = Math.cos(rot), sr = Math.sin(rot), a0 = 0.07 + amp * 0.16;
      ctx.clearRect(0, 0, w, h);
      for (const [px, py, pz] of pts) {
        const x = px * cr - pz * sr, z = px * sr + pz * cr;
        const d = 1 + a0 * (ruido(px * 2 + 9, py * 2 + t * 0.6, pz * 2 + t * 0.4) - 0.5) * 2;
        const persp = 2.6 / (2.6 + z * d), borda = Math.pow(1 - Math.abs(z), 0.7), lat = (py + 1) / 2;
        const cor = lat < 0.5 ? [120 + lat * 160, 180 - lat * 60, 255] : [210 + (lat - 0.5) * 90, 150 - (lat - 0.5) * 80, 255 - (lat - 0.5) * 200];
        ctx.fillStyle = `rgba(${cor[0] | 0},${cor[1] | 0},${cor[2] | 0},${((0.35 + borda * 0.65) * (0.5 + (1 - z) * 0.25)).toFixed(3)})`;
        const tam = (1.2 + borda * 1.5) * persp * dpr * 0.6;
        ctx.fillRect(w / 2 + x * d * R * persp, h / 2 + py * d * R * persp, tam, tam);
      }
      quadro = requestAnimationFrame(desenha);
    };
    quadro = requestAnimationFrame(desenha);
    return () => cancelAnimationFrame(quadro);
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
