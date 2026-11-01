"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { useRouter } from "@/lib/contrato/navegacao";
import { cn } from "@/lib/utils";
import type { ItemDeNavegacao } from "./navegacao";

// ---------------------------------------------------------------------------
// Abas com uma luz. A aba ativa é cercada por um anel de luz; ao trocar de aba
// o anel vira uma haste que se estica de uma aba à outra e volta a ser anel na
// nova. Cada ponta da luz é uma mola: a da frente é rápida e a de trás é mole
// enquanto falta caminho e fica dura quando a da frente chega (a distância que
// falta decide, não a velocidade, porque no estouro a velocidade é zero). A
// espessura cresce com a velocidade e a luz clareia a borda do vidro por onde
// passa. Dá para arrastar a luz pela barra: ao soltar, ela vai para a aba mais
// próxima. Com "reduzir movimento" a luz desliza sem esticar nem passar do
// ponto (e `localStorage["eva:arco"] = "elastico"` força o efeito inteiro).
// ---------------------------------------------------------------------------

/** Cada aba tem a sua cor (tokens de categoria do tema): a luz e o texto da aba ativa a tomam. */
const COR_DA_ABA: Record<string, string> = {
  "/home": "blue",
  "/conversations": "green",
  "/deals": "amber",
  "/contacts": "violet",
  "/tasks": "orange",
  "/dashboard": "cyan",
  "/agent-studio": "rose",
};

const suave = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

interface Ponta {
  x: number;
  v: number;
}

interface Estado {
  L: Ponta;
  R: Ponta;
  alvoL: number;
  alvoR: number;
  trecho: number;
  direcao: 1 | -1;
  raf: number;
  anterior: number;
  pronto: boolean;
  arrastando: boolean;
}

function elastico(): boolean {
  if (typeof window === "undefined") return true;
  try {
    if (window.localStorage.getItem("eva:arco") === "elastico") return true;
  } catch {
    /* sem armazenamento: vale a preferência do sistema */
  }
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AbasDeLuz({
  itens,
  ativo,
  etiqueta,
}: {
  itens: ItemDeNavegacao[];
  /** Índice da aba da tela atual, ou -1 quando a tela não é uma das abas. */
  ativo: number;
  etiqueta: (item: ItemDeNavegacao) => string | undefined;
}) {
  const router = useRouter();
  const nav = React.useRef<HTMLElement>(null);
  const abas = React.useRef<(HTMLAnchorElement | null)[]>([]);
  const haste = React.useRef<SVGRectElement>(null);
  const ativoRef = React.useRef(ativo);
  const sim = React.useRef<Estado>({ L: { x: 0, v: 0 }, R: { x: 0, v: 0 }, alvoL: 0, alvoR: 0, trecho: 1, direcao: 1, raf: 0, anterior: 0, pronto: false, arrastando: false });
  const toque = React.useRef<{ id: number; x0: number; moveu: boolean }>({ id: -1, x0: 0, moveu: false });

  const medir = React.useCallback((i: number) => {
    const a = abas.current[i];
    return a ? { L: a.offsetLeft, R: a.offsetLeft + a.offsetWidth } : null;
  }, []);

  const pintar = React.useCallback(() => {
    const s = sim.current, el = haste.current, n = nav.current;
    if (!el || !n) return;
    const altura = n.clientHeight - 6;
    if (altura <= 0) return; // barra escondida (largura de celular)
    el.setAttribute("x", String(Math.min(s.L.x, s.R.x)));
    el.setAttribute("y", "3");
    el.setAttribute("width", String(Math.abs(s.R.x - s.L.x)));
    el.setAttribute("height", String(altura));
    el.setAttribute("rx", String(altura / 2));
    // Quanto mais rápido, mais grossa e mais fraca: o peso sobe quando a haste mais trabalha.
    const rapido = Math.min(5, (Math.abs(s.L.v) + Math.abs(s.R.v)) / 2 / 450);
    el.style.strokeWidth = String(2 + rapido * 0.7);
    el.style.opacity = String(1 - Math.min(0.3, rapido * 0.08));
    n.style.setProperty("--luz-x", `${(s.L.x + s.R.x) / 2}px`);
  }, []);

  // O laço chama a si mesmo por aqui: a função não pode se citar antes de existir.
  const passoRef = React.useRef<(agora: number) => void>(() => {});
  const proximo = React.useCallback((agora: number) => passoRef.current(agora), []);
  const passo = React.useCallback(
    (agora: number) => {
      const s = sim.current;
      // Passos pequenos cobrem todo o tempo que passou: com poucos quadros por segundo a luz não fica em câmera lenta.
      const dt = Math.min(0.5, (agora - s.anterior) / 1000 || 0.016);
      s.anterior = agora;
      const livre = elastico();
      const partes = Math.max(1, Math.ceil(dt / 0.008)), h = dt / partes;
      for (let i = 0; i < partes; i++) {
        const frente = s.direcao === 1 ? "R" : "L";
        const alvo = { L: s.alvoL, R: s.alvoR };
        const falta = Math.abs(s[frente].x - alvo[frente]);
        const kb = 62 + 155 * (1 - suave(falta / s.trecho));
        for (const lado of ["L", "R"] as const) {
          const p = s[lado];
          const eFrente = lado === frente;
          const k = eFrente || !livre ? 235 : kb;
          const c = !livre ? 2 * Math.sqrt(k) : eFrente ? 22 : 1.44 * Math.sqrt(kb);
          p.v += (-k * (p.x - alvo[lado]) - c * p.v) * h;
          p.x += p.v * h;
        }
      }
      pintar();
      const quieto = Math.abs(s.L.x - s.alvoL) < 0.25 && Math.abs(s.R.x - s.alvoR) < 0.25 && Math.abs(s.L.v) < 3 && Math.abs(s.R.v) < 3;
      if (quieto) {
        s.L.x = s.alvoL; s.R.x = s.alvoR; s.L.v = 0; s.R.v = 0;
        pintar();
        s.raf = 0;
      } else s.raf = requestAnimationFrame(proximo);
    },
    [pintar, proximo]
  );
  React.useLayoutEffect(() => {
    passoRef.current = passo;
  }, [passo]);

  /** Leva a luz até os limites (L, R) dados; `animar=false` pula direto. */
  const levar = React.useCallback(
    (L: number, R: number, animar: boolean) => {
      const s = sim.current;
      s.alvoL = L; s.alvoR = R;
      s.direcao = (L + R) / 2 >= (s.L.x + s.R.x) / 2 ? 1 : -1;
      const frente = s.direcao === 1 ? s.R : s.L;
      s.trecho = Math.max(1, Math.abs((s.direcao === 1 ? R : L) - frente.x));
      if (!animar || !s.pronto) {
        s.L.x = L; s.R.x = R; s.L.v = 0; s.R.v = 0;
        s.pronto = true;
        pintar();
        return;
      }
      s.anterior = performance.now();
      if (!s.raf) s.raf = requestAnimationFrame(proximo);
    },
    [proximo, pintar]
  );

  // Trocou de tela: a luz vai até a aba nova (ou some, se a tela não é uma aba).
  React.useLayoutEffect(() => {
    ativoRef.current = ativo;
    const m = ativo >= 0 ? medir(ativo) : null;
    if (haste.current) haste.current.style.display = m ? "" : "none";
    if (m && !sim.current.arrastando) levar(m.L, m.R, true);
  }, [ativo, medir, levar]);

  // Largura mudou (fonte carregou, janela redimensionada): reencaixa sem animar.
  React.useEffect(() => {
    const n = nav.current;
    if (!n) return;
    const reencaixar = () => {
      const s = sim.current, m = ativoRef.current >= 0 ? medir(ativoRef.current) : null;
      if (m && !s.raf && !s.arrastando) { s.pronto = false; levar(m.L, m.R, false); }
    };
    const obs = new ResizeObserver(reencaixar);
    obs.observe(n);
    if (document.fonts?.ready) void document.fonts.ready.then(reencaixar);
    const s = sim.current;
    return () => {
      obs.disconnect();
      cancelAnimationFrame(s.raf);
      s.raf = 0;
    };
  }, [medir, levar]);

  function aoApertar(e: React.PointerEvent) {
    if (e.button !== 0) return;
    toque.current = { id: e.pointerId, x0: e.clientX, moveu: false };
  }
  function aoMover(e: React.PointerEvent) {
    const t = toque.current, n = nav.current;
    if (!n || t.id !== e.pointerId || ativoRef.current < 0) return;
    if (!t.moveu) {
      if (Math.abs(e.clientX - t.x0) < 8) return;
      t.moveu = true;
      sim.current.arrastando = true;
      n.setPointerCapture(e.pointerId);
    }
    const m = medir(ativoRef.current);
    if (!m) return;
    const largura = m.R - m.L, x = e.clientX - n.getBoundingClientRect().left;
    const L = Math.min(n.clientWidth - 4 - largura, Math.max(4, x - largura / 2));
    levar(L, L + largura, true);
  }
  function aoSoltar(e: React.PointerEvent) {
    const t = toque.current, n = nav.current;
    if (t.id !== e.pointerId) return;
    toque.current = { id: -1, x0: 0, moveu: false };
    if (!t.moveu || !n) return;
    if (n.hasPointerCapture(e.pointerId)) n.releasePointerCapture(e.pointerId);
    const s = sim.current;
    s.arrastando = false;
    const centro = (s.alvoL + s.alvoR) / 2;
    let melhor = ativoRef.current, dist = Infinity;
    itens.forEach((_, i) => {
      const m = medir(i);
      if (m && Math.abs((m.L + m.R) / 2 - centro) < dist) { dist = Math.abs((m.L + m.R) / 2 - centro); melhor = i; }
    });
    if (melhor !== ativoRef.current) router.push(itens[melhor].href);
    else {
      const m = medir(melhor);
      if (m) levar(m.L, m.R, true);
    }
  }

  const cor = ativo >= 0 ? COR_DA_ABA[itens[ativo].href] ?? "blue" : "blue";
  return (
    <nav
      ref={nav}
      aria-label="Seções"
      onPointerDown={aoApertar}
      onPointerMove={aoMover}
      onPointerUp={aoSoltar}
      onPointerCancel={aoSoltar}
      style={{ "--arc": `var(--cat-${cor}-solid)`, "--arc-fg": `var(--cat-${cor})`, touchAction: "pan-y" } as React.CSSProperties}
      className="vidro relative flex touch-pan-y select-none items-center gap-0.5 rounded-full p-1"
    >
      <span aria-hidden="true" className="arco-borda pointer-events-none absolute inset-0 rounded-full" />
      <span aria-hidden="true" className="arco-brilho pointer-events-none absolute top-full" />
      <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-[5] size-full overflow-visible">
        <rect ref={haste} className="arco-haste" fill="none" />
      </svg>
      {itens.map((item, i) => {
        const aqui = i === ativo, selo = etiqueta(item);
        return (
          <Link
            key={item.href}
            ref={(el) => {
              abas.current[i] = el;
            }}
            href={item.href}
            draggable={false}
            aria-current={aqui ? "page" : undefined}
            style={aqui ? { color: "var(--arc-fg)" } : undefined}
            className={cn(
              "relative z-10 flex h-9 items-center gap-1.5 rounded-full px-3.5 text-small font-medium transition-colors duration-200",
              aqui ? "font-semibold" : "text-text-secondary hover:text-text-primary"
            )}
          >
            <span>{item.label}</span>
            {selo && <span className="rounded-full bg-accent-solid px-1.5 font-mono text-caption font-medium leading-[18px] text-text-on-accent">{selo}</span>}
          </Link>
        );
      })}
    </nav>
  );
}
