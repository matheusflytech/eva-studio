"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface ChartPoint {
  label: string;
  value: number;
}

// ---------------------------------------------------------------------------
// Curva de área (v5): linha suave no azul de destaque, área em degradê, três
// guias finas com o eixo à direita e o pico marcado. Ao passar o mouse (ou
// tocar) a guia segue o ponto e a dica mostra o valor do dia. Com `suavizar`
// a curva usa a média de 3 pontos para não virar serrote; a dica continua
// mostrando o valor real.
//
// Desenha em pixels (mede a largura do contêiner) para que círculo e texto
// não se deformem como num viewBox esticado.
// ---------------------------------------------------------------------------

const compacto = new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 });

/** Teto "redondo" do eixo: 38.500 vira 40.000. */
function tetoRedondo(max: number): number {
  if (max <= 0) return 1;
  const ordem = 10 ** Math.floor(Math.log10(max));
  const passo = [1, 2, 2.5, 5, 10].find((p) => p * ordem >= max) ?? 10;
  return passo * ordem;
}

function mediaMovel(valores: number[]): number[] {
  return valores.map((_, i) => {
    const janela = valores.slice(Math.max(0, i - 1), Math.min(valores.length, i + 2));
    return janela.reduce((s, v) => s + v, 0) / janela.length;
  });
}

/** Caminho suave (Catmull-Rom → Bézier), com o controle preso entre topo e base. */
function caminhoSuave(pts: { x: number; y: number }[], topo: number, base: number): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M${pts[0].x} ${pts[0].y}`;
  const prender = (y: number) => Math.min(base, Math.max(topo, y));
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = prender(p1.y + (p2.y - p0.y) / 6);
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = prender(p2.y - (p3.y - p1.y) / 6);
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

export function AreaChart({
  data,
  height = 180,
  formatarValor = (v) => v.toLocaleString("pt-BR"),
  formatarEixo = (v) => compacto.format(v),
  suavizar = false,
  marcarPico = true,
  className,
}: {
  data: ChartPoint[];
  height?: number;
  /** Texto do valor na dica. */
  formatarValor?: (v: number) => string;
  /** Texto das guias do eixo (curto: "20 mil"). */
  formatarEixo?: (v: number) => string;
  suavizar?: boolean;
  /** Mostra a dica do maior ponto quando ninguém está apontando. */
  marcarPico?: boolean;
  className?: string;
}) {
  const caixa = React.useRef<HTMLDivElement | null>(null);
  const [largura, setLargura] = React.useState(0);
  const [apontado, setApontado] = React.useState<number | null>(null);
  const idDoDegrade = React.useId().replace(/:/g, "");

  React.useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => setLargura(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const reais = data.map((d) => d.value);
  const desenho = suavizar && data.length > 3 ? mediaMovel(reais) : reais;
  const teto = tetoRedondo(Math.max(...reais, 0));

  // Margens: eixo à direita, rótulos de data embaixo.
  const direita = 52;
  const topo = 10;
  const baseY = height - 22;
  const larguraUtil = Math.max(0, largura - direita);
  const passoX = data.length > 1 ? larguraUtil / (data.length - 1) : 0;
  const pts = desenho.map((v, i) => ({
    x: data.length > 1 ? i * passoX : larguraUtil / 2,
    y: baseY - (Math.max(0, v) / teto) * (baseY - topo),
  }));
  const linha = caminhoSuave(pts, topo, baseY);
  const area = pts.length ? `${linha} L${pts[pts.length - 1].x.toFixed(1)} ${baseY} L${pts[0].x.toFixed(1)} ${baseY} Z` : "";

  const pico = reais.length ? reais.indexOf(Math.max(...reais)) : -1;
  const foco = apontado ?? (marcarPico && pico >= 0 && reais[pico] > 0 ? pico : null);
  const guias = [0, 0.5, 1].map((f) => ({ y: baseY - f * (baseY - topo), valor: teto * f }));
  const cadaRotulo = Math.max(1, Math.ceil(data.length / 6));

  function aoApontar(e: React.PointerEvent<SVGSVGElement>) {
    if (!data.length || !larguraUtil) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - r.left;
    const i = passoX ? Math.round(x / passoX) : 0;
    setApontado(Math.min(data.length - 1, Math.max(0, i)));
  }

  const descricao =
    pico >= 0 ? `${data.length} pontos; o maior foi ${formatarValor(reais[pico])} em ${data[pico].label}.` : "Sem pontos.";

  return (
    <div ref={caixa} className={cn("relative w-full select-none", className)} style={{ height }}>
      {largura > 0 && (
        <svg
          width={largura}
          height={height}
          className="block overflow-visible"
          role="img"
          aria-label={descricao}
          onPointerMove={aoApontar}
          onPointerDown={aoApontar}
          onPointerLeave={() => setApontado(null)}
        >
          <defs>
            <linearGradient id={idDoDegrade} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" style={{ stopColor: "var(--color-accent-fg)", stopOpacity: 0.28 }} />
              <stop offset="1" style={{ stopColor: "var(--color-accent-fg)", stopOpacity: 0 }} />
            </linearGradient>
          </defs>
          {guias.map((g) => (
            <g key={g.y}>
              <line x1={0} x2={larguraUtil} y1={g.y} y2={g.y} className="stroke-border-subtle" strokeWidth={1} />
              <text x={larguraUtil + 10} y={g.y + 4} className="fill-text-tertiary font-mono text-caption">
                {formatarEixo(g.valor)}
              </text>
            </g>
          ))}
          <path d={area} fill={`url(#${idDoDegrade})`} />
          <path d={linha} fill="none" className="stroke-accent-fg" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {data.map((d, i) =>
            i % cadaRotulo === 0 ? (
              <text key={i} x={pts[i].x} y={height - 4} textAnchor={i === 0 ? "start" : "middle"} className="fill-text-tertiary font-mono text-caption">
                {d.label}
              </text>
            ) : null
          )}
          {foco !== null && pts[foco] && (
            <g>
              <line x1={pts[foco].x} x2={pts[foco].x} y1={pts[foco].y} y2={baseY} className="stroke-text-tertiary" strokeWidth={1} strokeDasharray="3 5" opacity={0.6} />
              <circle cx={pts[foco].x} cy={pts[foco].y} r={5} className="fill-page stroke-accent-fg" strokeWidth={2.2} />
            </g>
          )}
        </svg>
      )}
      {foco !== null && pts[foco] && largura > 0 && (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inline-flex h-[26px] items-center whitespace-nowrap rounded-full bg-inverse px-3 font-mono text-caption font-medium text-inverse-fg"
          style={{
            left: Math.min(Math.max(pts[foco].x, 70), larguraUtil - 40),
            top: pts[foco].y,
            transform: "translate(-50%, -150%)",
          }}
        >
          {data[foco].label} · {formatarValor(reais[foco])}
        </span>
      )}
    </div>
  );
}
