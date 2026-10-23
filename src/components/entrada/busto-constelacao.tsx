"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Júlio César em nuvem de pontos (proposta 2 do login, aprovada). Base: foto do
// "retrato de Túsculo" (Museu de Antiguidades de Turim, Marie-Lan Taÿ Pamart,
// domínio público), em `public/entrada/cesar.jpg`, já em cinza com o fundo
// apagado. Cada ponto é um pedaço do mármore; o brilho vira profundidade (o
// claro fica mais perto). O busto gira devagar seguindo o mouse, os pontos
// acendem perto da mão e uma faixa de luz varre de cima para baixo. Ao abrir,
// os pontos acendem em cascata. Com "reduzir movimento": tudo mais lento.
// ---------------------------------------------------------------------------

interface Ponto { x: number; y: number; z: number; v: number; f: number }

const LARGURA_DA_AMOSTRA = 260;

function semente(s: number) {
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function BustoConstelacao({ className }: { className?: string }) {
  const caixa = React.useRef<HTMLDivElement>(null);
  const ref = React.useRef<HTMLCanvasElement>(null);

  React.useEffect(() => {
    const canvas = ref.current, palco = caixa.current;
    if (!canvas || !palco) return;
    const g = canvas.getContext("2d");
    if (!g) return;
    const calmo = window.matchMedia("(prefers-reduced-motion: reduce)");
    let vivo = true, quadro = 0;
    let pts: Ponto[] = [], bh = 1;
    let W = 0, H = 0, escala = 1;

    const ajustar = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const box = canvas.getBoundingClientRect();
      W = box.width; H = box.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      escala = (H * 0.98) / bh;
    };
    const obs = new ResizeObserver(ajustar);

    // Mão: posição suavizada e "força" que sobe ao entrar e desce ao sair.
    const mao = { rx: -1e4, ry: -1e4, x: -1e4, y: -1e4, dentro: false, forca: 0 };
    const mover = (e: PointerEvent) => {
      const r = palco.getBoundingClientRect();
      mao.rx = e.clientX - r.left; mao.ry = e.clientY - r.top;
      if (!mao.dentro) { mao.x = mao.rx; mao.y = mao.ry; }
      mao.dentro = true;
    };
    const sair = () => (mao.dentro = false);
    palco.addEventListener("pointermove", mover);
    palco.addEventListener("pointerleave", sair);

    const img = new Image();
    img.onload = () => {
      if (!vivo) return;
      const w = LARGURA_DA_AMOSTRA, h = Math.round((w * img.height) / img.width);
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const cg = c.getContext("2d");
      if (!cg) return;
      cg.drawImage(img, 0, 0, w, h);
      const d = cg.getImageData(0, 0, w, h).data;
      const rand = semente(9);
      const lista: Ponto[] = [];
      for (let y = 0; y < h; y += 2)
        for (let x = 0; x < w; x += 2) {
          const v = d[(y * w + x) * 4] / 255;
          if (v < 0.12 || rand() > 0.35 + v * 0.65) continue;
          lista.push({ x: x - w / 2 + (rand() - 0.5), y: y - h / 2 + (rand() - 0.5), z: (v - 0.5) * 90 + (rand() - 0.5) * 6, v, f: rand() * 6.28 });
        }
      pts = lista; bh = h;
      ajustar();
      obs.observe(canvas);
      quadro = requestAnimationFrame(desenhar);
    };
    img.src = "/entrada/cesar.jpg";

    let giro = 0, incl = 0, t0 = 0, acumulado = 0, ultimo = 0;
    function desenhar(t: number) {
      quadro = requestAnimationFrame(desenhar);
      if (!t0) t0 = ultimo = t;
      acumulado += (t - ultimo) * (calmo.matches ? 0.4 : 1);
      ultimo = t;
      const tempo = acumulado / 1000;
      mao.x += (mao.rx - mao.x) * 0.08; mao.y += (mao.ry - mao.y) * 0.08;
      mao.forca += ((mao.dentro ? 1 : 0) - mao.forca) * 0.08;
      // giro: segue o mouse (±0,45 rad) e balança sozinho bem devagar
      const ativo = mao.forca > 0.05;
      const alvoGiro = (ativo ? (mao.x / W - 0.55) * 0.9 : 0) + Math.sin(tempo * 0.25) * 0.12;
      const alvoIncl = ativo ? (mao.y / H - 0.5) * 0.25 : 0;
      giro += (alvoGiro - giro) * 0.05; incl += (alvoIncl - incl) * 0.05;
      const cg = Math.cos(giro), sg = Math.sin(giro), ci = Math.cos(incl), si = Math.sin(incl);
      const cx = W * 0.56, cy = H * 0.52, foco = 700;
      const faixa = ((tempo * 0.18) % 1.6) - 0.3;
      const entrada = Math.min(1, tempo / 1.4); // os pontos acendem em cascata de cima para baixo
      g!.clearRect(0, 0, W, H);
      g!.globalCompositeOperation = "lighter";
      for (const p of pts) {
        const altura = p.y / bh + 0.5;
        if (altura > entrada * 1.25) continue;
        const x = p.x * cg + p.z * sg;
        let z = -p.x * sg + p.z * cg;
        const y = p.y * ci - z * si;
        z = p.y * si + z * ci;
        const k = foco / (foco - z * escala * 0.5);
        const sx = cx + x * escala * k, sy = cy + y * escala * k;
        let a = 0.26 + p.v * 0.8;
        const dx = sx - mao.x, dy = sy - mao.y, dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 120) a += (1 - dist / 120) * 0.9 * mao.forca;
        const fy = altura - faixa;
        if (Math.abs(fy) < 0.06) a += (1 - Math.abs(fy) / 0.06) * 0.6;
        a *= (0.75 + 0.25 * Math.sin(tempo * 1.6 + p.f)) * Math.min(1, (entrada * 1.25 - altura) * 6);
        g!.fillStyle = `rgba(214,222,240,${Math.min(1, a)})`;
        const r = 0.6 + p.v * 0.9 * k;
        g!.fillRect(sx, sy, r, r);
      }
      g!.globalCompositeOperation = "source-over";
    }
    const aoMudarAba = () => {
      cancelAnimationFrame(quadro);
      if (!document.hidden && pts.length) { ultimo = performance.now(); quadro = requestAnimationFrame(desenhar); }
    };
    document.addEventListener("visibilitychange", aoMudarAba);

    return () => {
      vivo = false;
      cancelAnimationFrame(quadro);
      obs.disconnect();
      palco.removeEventListener("pointermove", mover);
      palco.removeEventListener("pointerleave", sair);
      document.removeEventListener("visibilitychange", aoMudarAba);
    };
  }, []);

  return (
    <div ref={caixa} className={cn("relative overflow-hidden", className)}>
      <canvas ref={ref} aria-hidden="true" className="absolute inset-0 block h-full w-full" />
    </div>
  );
}
