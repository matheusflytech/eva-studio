"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Fundo "gelo" das telas de entrada: uma cordilheira em relevo de linhas finas
// (a mesma linguagem das curvas de nível do fundo vivo) sobre céu cor de gelo,
// com neblina embaixo. ~54 perfis empilhados do fundo (claro, "ar" na frente)
// para a frente (mais marcado); o preenchimento de cada perfil esconde os de
// trás. A serra respira bem devagar (~30 quadros/s); com "reduzir movimento"
// fica mais lenta, nunca parada. Para com a aba oculta.
// ---------------------------------------------------------------------------

function semente(s: number) {
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function ruido1d(rand: () => number, n: number) {
  const v = Array.from({ length: n }, rand);
  return (x: number) => {
    const i = Math.floor(x), f = x - i;
    const a = v[((i % n) + n) % n], b = v[(((i + 1) % n) + n) % n];
    return a + (b - a) * f * f * (3 - 2 * f);
  };
}

const PERFIS = 54;

export function FundoGelo({ className }: { className?: string }) {
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const calmo = window.matchMedia("(prefers-reduced-motion: reduce)");
    const r = ruido1d(semente(11), 1024), rs = semente(7);
    // Picos com posição, altura e largura próprias (o maior perto do meio) e
    // um detalhe fino de rocha por cima.
    const picos = Array.from({ length: 13 }, (_, i) => {
      const x = (i + 0.5) / 13 + (rs() - 0.5) * 0.06;
      return { x, h: 0.35 + 0.65 * rs() * (1 - Math.abs(x - 0.5) * 0.9), w: 0.07 + 0.09 * rs() };
    });
    const serra = (u: number, det: number) => {
      let h = 0;
      for (const q of picos) {
        const d = Math.abs(u - q.x) / q.w;
        if (d < 1) h = Math.max(h, q.h * Math.pow(1 - d, 1.25));
      }
      let f = 0, a = 0.5, k = 1;
      for (let o = 0; o < 4; o++) { f += a * (r(u * 14 * k + o * 7) - 0.5); k *= 2.1; a *= 0.5; }
      return h * (1 + f * det) + f * 0.04;
    };

    let W = 0, H = 0, ceu: CanvasGradient | null = null, nevoa: CanvasGradient | null = null;
    const ajustar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const box = canvas.getBoundingClientRect();
      W = box.width; H = box.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      ceu = g.createLinearGradient(0, 0, 0, H);
      ceu.addColorStop(0, "#f8fafc"); ceu.addColorStop(1, "#e9eef4");
      nevoa = g.createLinearGradient(0, H * 0.6, 0, H);
      nevoa.addColorStop(0, "rgba(235,240,245,0)"); nevoa.addColorStop(1, "rgba(233,238,244,0.96)");
    };
    ajustar();
    const obs = new ResizeObserver(ajustar);
    obs.observe(canvas);

    let quadro = 0, ultimo = 0, acumulado = 0;
    const desenhar = (t: number) => {
      quadro = requestAnimationFrame(desenhar);
      if (t - ultimo < 33) return; // ~30 quadros/s bastam para algo tão lento
      acumulado += (t - (ultimo || t)) * (calmo.matches ? 0.35 : 1);
      ultimo = t;
      if (!ceu || !nevoa) return;
      g.fillStyle = ceu;
      g.fillRect(0, 0, W, H);
      const deriva = Math.sin(acumulado * 0.00005) * 0.006;
      for (let j = 0; j < PERFIS; j++) {
        const p = j / (PERFIS - 1);
        const yBase = H * (0.36 + 0.62 * p), alt = H * 0.4 * (1 - p * 0.55);
        // cada perfil balança um pouquinho fora de fase: a serra "respira"
        const fase = Math.sin(acumulado * 0.00022 + j * 0.35) * 0.0025;
        g.beginPath();
        for (let x = 0; x <= W; x += 3) {
          const u = x / W + (p - 0.5) * 0.05 * Math.sin(j * 0.7) + deriva + fase;
          const y = yBase - alt * serra(u, 0.55 + p * 0.4);
          if (x) g.lineTo(x, y); else g.moveTo(x, y);
        }
        g.lineTo(W, H); g.lineTo(0, H); g.closePath();
        g.fillStyle = ceu; g.fill();
        g.strokeStyle = `rgba(56,74,102,${0.14 + 0.5 * Math.pow(p, 1.2)})`;
        g.lineWidth = 0.55 + p * 0.55;
        g.stroke();
      }
      g.fillStyle = nevoa;
      g.fillRect(0, 0, W, H);
    };
    const aoMudarAba = () => {
      cancelAnimationFrame(quadro);
      if (!document.hidden) { ultimo = 0; quadro = requestAnimationFrame(desenhar); }
    };
    quadro = requestAnimationFrame(desenhar);
    document.addEventListener("visibilitychange", aoMudarAba);
    return () => {
      cancelAnimationFrame(quadro);
      obs.disconnect();
      document.removeEventListener("visibilitychange", aoMudarAba);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={cn("block", className)} />;
}
