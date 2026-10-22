"use client";

import * as React from "react";
import { ruido } from "@/lib/fundo/campo-de-curvas";

// ---------------------------------------------------------------------------
// Presença da Eva: esfera de partículas viva. Gira em dois eixos, respira,
// deforma como um líquido (ruído 3D que corre pela superfície) e se estica na
// direção do cursor quando ele chega perto; um clique solta uma onda. Quando a
// Eva está "falando" (prop `falando`) a deformação aumenta.
//
// O canvas é maior que a esfera (folga para ela esticar sem cortar). Com
// "reduzir movimento" a esfera continua viva, só que mais lenta e sem esticar.
// ---------------------------------------------------------------------------

const N = 1600;

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
      const y = 1 - (k / (N - 1)) * 2,
        r = Math.sqrt(1 - y * y),
        th = ouro * k;
      return [Math.cos(th) * r, y, Math.sin(th) * r] as const;
    });
    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)");

    // Cursor em coordenadas da esfera (1 = borda), suavizado; `perto` vai de 0
    // (longe) a 1 (em cima) e também é suavizado, para a esfera não pular.
    const alvo = { x: 0, y: 0, perto: 0 };
    const cursor = { x: 0, y: 0, perto: 0 };
    let onda = 0;
    let t = 0,
      amp = 0,
      anterior = performance.now(),
      quadro = 0,
      visivel = true;

    const aoMover = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      const raio = Math.min(r.width, r.height) * 0.32;
      const x = (e.clientX - (r.left + r.width / 2)) / raio;
      const y = (e.clientY - (r.top + r.height / 2)) / raio;
      alvo.x = x;
      alvo.y = y;
      alvo.perto = Math.max(0, 1 - (Math.hypot(x, y) - 0.6) / 2.4);
    };
    const aoClicar = () => {
      onda = 1;
    };
    window.addEventListener("pointermove", aoMover, { passive: true });
    cv.addEventListener("pointerdown", aoClicar);

    const io = new IntersectionObserver(([e]) => {
      visivel = e.isIntersecting;
    });
    io.observe(cv);

    const desenha = (agora: number) => {
      quadro = requestAnimationFrame(desenha);
      const passo = Math.min(0.05, (agora - anterior) / 1000);
      anterior = agora;
      if (!visivel || document.hidden) return;
      const calmo = reduz.matches;
      const dt = passo * (calmo ? 0.35 : 1);
      t += dt;

      // Molas exponenciais: fala, cursor e onda chegam e saem sem degrau.
      amp += ((falandoRef.current ? 1 : 0) - amp) * Math.min(1, passo * 3);
      const k = Math.min(1, passo * 6);
      cursor.x += (alvo.x - cursor.x) * k;
      cursor.y += (alvo.y - cursor.y) * k;
      cursor.perto += ((calmo ? 0 : alvo.perto) - cursor.perto) * Math.min(1, passo * 4);
      onda = Math.max(0, onda - passo * 1.1);

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(cv.clientWidth * dpr),
        h = Math.round(cv.clientHeight * dpr);
      if (cv.width !== w || cv.height !== h) {
        cv.width = w;
        cv.height = h;
      }

      // Respiração + um passeio pequeno do centro: a esfera nunca fica parada.
      const respira = 1 + Math.sin(t * 1.4) * 0.025 + amp * Math.sin(t * 7) * 0.02;
      const R = Math.min(w, h) * 0.32 * respira;
      const cx = w / 2 + Math.sin(t * 0.5) * R * 0.04 + cursor.x * cursor.perto * R * 0.08;
      const cy = h / 2 + Math.cos(t * 0.37) * R * 0.04 + cursor.y * cursor.perto * R * 0.08;

      // Gira em Y sempre; inclina em X e Y na direção do cursor.
      const rotY = t * 0.35 + cursor.x * cursor.perto * 0.5;
      const rotX = Math.sin(t * 0.21) * 0.25 + cursor.y * cursor.perto * 0.5;
      const cy1 = Math.cos(rotY), sy1 = Math.sin(rotY), cx1 = Math.cos(rotX), sx1 = Math.sin(rotX);

      const deform = 0.1 + amp * 0.22;
      const dirLen = Math.hypot(cursor.x, cursor.y) || 1;
      const dx = cursor.x / dirLen, dy = cursor.y / dirLen;

      ctx.clearRect(0, 0, w, h);
      ctx.globalCompositeOperation = "lighter";
      for (const [px, py, pz] of pts) {
        // rotação Y, depois X
        const x1 = px * cy1 - pz * sy1,
          z1 = px * sy1 + pz * cy1;
        const y2 = py * cx1 - z1 * sx1,
          z2 = py * sx1 + z1 * cx1;

        // líquido: ruído que corre pela superfície (coordenadas do ponto, não
        // da tela, para a forma girar junto)
        const n = ruido(px * 1.6 + t * 0.35, py * 1.6 - t * 0.25, pz * 1.6 + t * 0.3) - 0.5;
        let d = 1 + deform * n * 2;

        // onda do clique: anel que corre do polo da frente para trás
        if (onda > 0) d += Math.sin((z2 + 1) * 6 - (1 - onda) * 14) * 0.06 * onda;

        // esticar: o lado virado para o cursor se alonga na direção dele
        const face = Math.max(0, x1 * dx + y2 * dy);
        const puxa = cursor.perto * Math.pow(face, 3) * 0.32;

        const persp = 3 / (3 + z2);
        const sx = cx + (x1 * d + dx * puxa) * R * persp;
        const sy = cy + (y2 * d + dy * puxa) * R * persp;

        const frente = (1 - z2) / 2; // 1 = de frente para quem olha
        const borda = Math.pow(1 - Math.abs(z2), 0.6);
        const lat = (y2 + 1) / 2;
        const r = lat < 0.5 ? 110 + lat * 170 : 195 + (lat - 0.5) * 110;
        const g = lat < 0.5 ? 170 - lat * 50 : 145 - (lat - 0.5) * 90;
        const b = lat < 0.5 ? 255 : 255 - (lat - 0.5) * 170;
        const a = (0.16 + borda * 0.4) * (0.35 + frente * 0.65) * (1 + puxa * 1.5);
        ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},${Math.min(1, a).toFixed(3)})`;
        const tam = (0.9 + frente * 1.3) * persp * dpr;
        ctx.fillRect(sx - tam / 2, sy - tam / 2, tam, tam);
      }
      ctx.globalCompositeOperation = "source-over";
    };
    quadro = requestAnimationFrame(desenha);
    return () => {
      cancelAnimationFrame(quadro);
      io.disconnect();
      window.removeEventListener("pointermove", aoMover);
      cv.removeEventListener("pointerdown", aoClicar);
    };
  }, []);

  return <canvas ref={ref} aria-hidden="true" className={className} />;
}
