"use client";

import * as React from "react";
import { ruido } from "@/lib/fundo/campo-de-curvas";
import { cn } from "@/lib/utils";
import { hexParaRgb, useCorDoAgente } from "./cor-do-agente";

// ---------------------------------------------------------------------------
// Orbe do agente: a mesma família da orbe da Eva (esfera de Fibonacci que gira,
// respira e deforma como líquido com o ruído 3D do fundo), tingida pela cor do
// agente. A cor vira um degradê com variação de luz: mais clara em cima, a cor
// pura no meio, mais funda (e com o tom levemente girado) embaixo. Partículas
// somam luz (brilho aditivo); as cristas da deformação acendem.
//
// O canvas é 1,5× a caixa (folga para deformar sem cortar), centrado nela e
// sem receber clique. `leve` (listas): menos partículas, ~30 quadros/s e sem
// cursor. Para de desenhar fora da tela e com a aba oculta (o laço desliga, não
// só pula quadros). Com "reduzir movimento" fica mais lenta, nunca parada.
// ---------------------------------------------------------------------------

const FOLGA = 1.5;
const FAIXAS = 16; // tons do degradê (agrupa partículas: um fillStyle por faixa)

type Rgb = [number, number, number];

function paraHsl([r, g, b]: Rgb): Rgb {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function deHsl([h, s, l]: Rgb): Rgb {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const canal = (t: number) => {
    t = (t + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [canal(h + 1 / 3) * 255, canal(h) * 255, canal(h - 1 / 3) * 255];
}

const mistura = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const css = ([r, g, b]: Rgb, a = 1) => `rgba(${r | 0},${g | 0},${b | 0},${a})`;

/**
 * Degradê da cor do agente: [claro, base, fundo] e as faixas intermediárias.
 * No tema claro o topo não chega perto do branco (sumiria no fundo da página).
 */
function degradeDaCor(hex: string, temaClaro: boolean) {
  const base = hexParaRgb(hex);
  const [h, s, l] = paraHsl(base);
  // a cor "viva": garante saturação e luz mínimas para brilhar mesmo se for cinza-escuro
  const viva = deHsl([h, Math.max(s, 0.18), Math.min(0.66, Math.max(l, 0.5))]);
  const claro = temaClaro
    ? deHsl([(h + 0.97) % 1, Math.min(1, s * 0.9 + 0.05), Math.min(0.72, l + 0.12)])
    : mistura(deHsl([(h + 0.97) % 1, s * 0.7, Math.min(0.92, l + 0.32)]), [255, 255, 255], 0.15);
  const fundo = deHsl([(h + 0.07) % 1, Math.min(1, s * 1.05 + 0.05), Math.max(temaClaro ? 0.26 : 0.3, l * (temaClaro ? 0.6 : 0.72))]);
  const faixas = Array.from({ length: FAIXAS }, (_, i) => {
    const lat = i / (FAIXAS - 1);
    return css(lat < 0.5 ? mistura(claro, viva, lat * 2) : mistura(viva, fundo, (lat - 0.5) * 2));
  });
  return { claro, viva, fundo, faixas };
}

function pontosDeFibonacci(n: number) {
  const ouro = Math.PI * (3 - Math.sqrt(5));
  const p = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const y = 1 - (k / (n - 1)) * 2, r = Math.sqrt(1 - y * y), th = ouro * k;
    p[k * 3] = Math.cos(th) * r;
    p[k * 3 + 1] = y;
    p[k * 3 + 2] = Math.sin(th) * r;
  }
  return p;
}

export function OrbeDoAgente({
  agenteId,
  cor,
  tamanho,
  falando = false,
  leve = false,
  className,
}: {
  agenteId: string;
  /** Força uma cor (ex.: prévia no seletor). Sem ela, usa a do agente. */
  cor?: string;
  /** Lado da caixa em px (a orbe ocupa a caixa; a deformação passa um pouco). */
  tamanho: number;
  falando?: boolean;
  leve?: boolean;
  className?: string;
}) {
  const doAgente = useCorDoAgente(agenteId).cor;
  const corFinal = cor ?? doAgente;
  const ref = React.useRef<HTMLCanvasElement>(null);
  const falandoRef = React.useRef(falando);
  const corRef = React.useRef(corFinal);
  React.useEffect(() => {
    falandoRef.current = falando;
    corRef.current = corFinal;
  });

  React.useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;

    const N = leve
      ? Math.round(Math.min(360, Math.max(160, tamanho * 7)))
      : Math.round(Math.min(1600, Math.max(520, tamanho * 14)));
    const pts = pontosDeFibonacci(N);
    // por quadro: posição na tela, tamanho, alfa e faixa de cor de cada ponto
    const sxs = new Float32Array(N), sys = new Float32Array(N), tams = new Float32Array(N), alfas = new Float32Array(N);
    const faixa = new Uint8Array(N), contagem = new Uint16Array(FAIXAS + 1), ordem = new Uint16Array(N);

    const reduz = window.matchMedia("(prefers-reduced-motion: reduce)");
    const ehTemaClaro = () => document.documentElement.getAttribute("data-theme") === "light";
    let temaClaro = ehTemaClaro();
    let tons = degradeDaCor(corRef.current, temaClaro);
    let corUsada = corRef.current;

    const alvo = { x: 0, y: 0, perto: 0 };
    const cursor = { x: 0, y: 0, perto: 0 };
    let onda = 0;
    // fase inicial diferente por orbe: uma lista não pulsa em uníssono
    let t = 0;
    for (let i = 0; i < agenteId.length; i++) t = (t * 31 + agenteId.charCodeAt(i)) % 997;
    t = t / 37;
    let amp = 0, anterior = performance.now(), quadro = 0, rodando = false, visivel = true;

    const aoMover = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      const raio = Math.min(r.width, r.height) * 0.3;
      const x = (e.clientX - (r.left + r.width / 2)) / raio;
      const y = (e.clientY - (r.top + r.height / 2)) / raio;
      alvo.x = x;
      alvo.y = y;
      alvo.perto = Math.max(0, 1 - (Math.hypot(x, y) - 0.6) / 2.4);
    };
    const aoClicar = (e: PointerEvent) => {
      const r = cv.getBoundingClientRect();
      if (Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < r.width * 0.32) onda = 1;
    };
    if (!leve) {
      window.addEventListener("pointermove", aoMover, { passive: true });
      window.addEventListener("pointerdown", aoClicar, { passive: true });
    }

    const desenha = (agora: number) => {
      if (!visivel || document.hidden) {
        rodando = false;
        return;
      }
      quadro = requestAnimationFrame(desenha);
      if (leve && agora - anterior < 32) return;
      const passo = Math.min(0.05, (agora - anterior) / 1000);
      anterior = agora;
      const calmo = reduz.matches;
      t += passo * (calmo ? 0.35 : 1);

      const claroAgora = ehTemaClaro();
      if (corRef.current !== corUsada || claroAgora !== temaClaro) {
        corUsada = corRef.current;
        temaClaro = claroAgora;
        tons = degradeDaCor(corUsada, temaClaro);
      }
      const ganho = temaClaro ? 1.45 : 1; // sobre fundo claro a luz somada aparece menos

      amp += ((falandoRef.current ? 1 : 0) - amp) * Math.min(1, passo * 3);
      const k = Math.min(1, passo * 6);
      cursor.x += (alvo.x - cursor.x) * k;
      cursor.y += (alvo.y - cursor.y) * k;
      cursor.perto += ((calmo || leve ? 0 : alvo.perto) - cursor.perto) * Math.min(1, passo * 4);
      onda = Math.max(0, onda - passo * 1.1);

      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const lado = Math.round(tamanho * FOLGA * dpr);
      if (cv.width !== lado || cv.height !== lado) {
        cv.width = lado;
        cv.height = lado;
      }

      const respira = 1 + Math.sin(t * 1.4) * 0.025 + amp * Math.sin(t * 7) * 0.025;
      const R = lado * 0.3 * respira;
      const cx = lado / 2 + Math.sin(t * 0.5) * R * 0.03 + cursor.x * cursor.perto * R * 0.08;
      const cy = lado / 2 + Math.cos(t * 0.37) * R * 0.03 + cursor.y * cursor.perto * R * 0.08;

      const rotY = t * (0.35 + amp * 0.25) + cursor.x * cursor.perto * 0.5;
      const rotX = Math.sin(t * 0.21) * 0.25 + cursor.y * cursor.perto * 0.5;
      const cy1 = Math.cos(rotY), sy1 = Math.sin(rotY), cx1 = Math.cos(rotX), sx1 = Math.sin(rotX);

      const deform = 0.11 + amp * 0.2;
      const dirLen = Math.hypot(cursor.x, cursor.y) || 1;
      const dx = cursor.x / dirLen, dy = cursor.y / dirLen;
      const vel = 1 + amp * 0.8;

      ctx.clearRect(0, 0, lado, lado);

      // corpo: um brilho suave da cor, com a luz vindo de cima à esquerda, para
      // a orbe pequena ler como esfera e não como poeira
      const corpo = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.05, cx, cy, R * 1.12);
      corpo.addColorStop(0, css(tons.claro, (leve ? 0.32 : 0.22) * ganho));
      corpo.addColorStop(0.55, css(tons.viva, (leve ? 0.16 : 0.1) * ganho));
      corpo.addColorStop(1, css(tons.fundo, 0));
      ctx.fillStyle = corpo;
      ctx.fillRect(0, 0, lado, lado);

      contagem.fill(0);
      for (let i = 0; i < N; i++) {
        const px = pts[i * 3], py = pts[i * 3 + 1], pz = pts[i * 3 + 2];
        const x1 = px * cy1 - pz * sy1, z1 = px * sy1 + pz * cy1;
        const y2 = py * cx1 - z1 * sx1, z2 = py * sx1 + z1 * cx1;

        const n = ruido(px * 1.6 + t * 0.35 * vel, py * 1.6 - t * 0.25 * vel, pz * 1.6 + t * 0.3 * vel) - 0.5;
        let d = 1 + deform * n * 2;
        if (onda > 0) d += Math.sin((z2 + 1) * 6 - (1 - onda) * 14) * 0.06 * onda;

        const face = Math.max(0, x1 * dx + y2 * dy);
        const puxa = cursor.perto * face * face * face * 0.32;

        const persp = 3 / (3 + z2);
        sxs[i] = cx + (x1 * d + dx * puxa) * R * persp;
        sys[i] = cy + (y2 * d + dy * puxa) * R * persp;

        const frente = (1 - z2) / 2;
        const borda = Math.pow(1 - Math.abs(z2), 0.6);
        const crista = Math.max(0, n) * 2.2; // onde a superfície sobe, acende
        alfas[i] = Math.min(1, (0.16 + borda * 0.4 + crista * 0.25) * (0.35 + frente * 0.65) * (1 + puxa * 1.5) * ganho);
        tams[i] = (0.9 + frente * 1.3 + crista * 0.5) * persp * dpr * (leve ? 1.15 : 1);
        const f = Math.max(0, Math.min(FAIXAS - 1, Math.round(((y2 + 1) / 2) * (FAIXAS - 1))));
        faixa[i] = f;
        contagem[f + 1]++;
      }
      // agrupa por faixa (contagem): um fillStyle por tom, não por partícula
      for (let f = 1; f <= FAIXAS; f++) contagem[f] += contagem[f - 1];
      for (let i = 0; i < N; i++) ordem[contagem[faixa[i]]++] = i;

      ctx.globalCompositeOperation = "lighter";
      let atual = -1;
      for (let j = 0; j < N; j++) {
        const i = ordem[j];
        if (faixa[i] !== atual) {
          atual = faixa[i];
          ctx.fillStyle = tons.faixas[atual];
        }
        ctx.globalAlpha = alfas[i];
        const tam = tams[i];
        ctx.fillRect(sxs[i] - tam / 2, sys[i] - tam / 2, tam, tam);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    };

    const ligar = () => {
      if (rodando || !visivel || document.hidden) return;
      rodando = true;
      anterior = performance.now() - 40; // desenha já no primeiro quadro
      quadro = requestAnimationFrame(desenha);
    };
    const desligar = () => {
      rodando = false;
      cancelAnimationFrame(quadro);
    };

    const io = new IntersectionObserver(([e]) => {
      visivel = e.isIntersecting;
      if (visivel) ligar();
      else desligar();
    });
    io.observe(cv);
    const aoMudarAba = () => (document.hidden ? desligar() : ligar());
    document.addEventListener("visibilitychange", aoMudarAba);
    ligar();

    return () => {
      desligar();
      io.disconnect();
      document.removeEventListener("visibilitychange", aoMudarAba);
      window.removeEventListener("pointermove", aoMover);
      window.removeEventListener("pointerdown", aoClicar);
    };
  }, [leve, tamanho, agenteId]);

  return (
    <span
      aria-hidden="true"
      className={cn("pointer-events-none relative inline-block shrink-0", className)}
      style={{ width: tamanho, height: tamanho }}
    >
      <canvas
        ref={ref}
        className="absolute"
        style={{
          width: tamanho * FOLGA,
          height: tamanho * FOLGA,
          left: (tamanho - tamanho * FOLGA) / 2,
          top: (tamanho - tamanho * FOLGA) / 2,
        }}
      />
    </span>
  );
}
