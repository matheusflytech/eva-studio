"use client";

import * as React from "react";
import { Sparkles, Star, TrendingUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { AcaoDoRecado, Recado } from "./eva-voz";

/**
 * Topo de Negócios com a cara da Eva (variação 1 da humanização): cabeçalho
 * com a marca e um brilho só ali (direção B), recado da Eva em primeira
 * pessoa (direção A) e momentos que valem comemorar (direção B).
 */

const TOM_QUENTE = "#f2a65a";

/** A marca da Eva: o "A" com a barra no tom quente. */
export function MarcaEva({ tamanho = 22, barra = TOM_QUENTE }: { tamanho?: number; barra?: string }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" aria-hidden>
      <path d="M4 20 12 4l8 16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8.5 14h7" stroke={barra} strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function CabecalhoAssinatura({
  funil,
  frase,
  seletor,
  acoes,
}: {
  funil: string;
  frase: React.ReactNode;
  seletor?: React.ReactNode;
  acoes: React.ReactNode;
}) {
  return (
    <header className="relative isolate shrink-0 overflow-hidden rounded-2xl border border-border-subtle bg-surface-1 px-5 py-5 sm:px-6">
      {/* Brilho da marca, preso ao canto do cabeçalho: assinatura, não papel de parede. */}
      <svg
        aria-hidden
        viewBox="0 0 420 220"
        className="pointer-events-none absolute -right-10 -top-16 -z-10 h-[220px] w-[420px] opacity-60 motion-safe:animate-[eva-respira_9s_ease-in-out_infinite]"
      >
        <defs>
          <radialGradient id="eva-g1" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#5b8def" stopOpacity="0.5" />
            <stop offset="1" stopColor="#5b8def" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="eva-g2" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor={TOM_QUENTE} stopOpacity="0.4" />
            <stop offset="1" stopColor={TOM_QUENTE} stopOpacity="0" />
          </radialGradient>
        </defs>
        <ellipse cx="170" cy="120" rx="170" ry="90" fill="url(#eva-g1)" />
        <ellipse cx="300" cy="90" rx="120" ry="70" fill="url(#eva-g2)" />
      </svg>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-border-default bg-bg-base text-text-primary">
            <MarcaEva tamanho={26} />
          </span>
          <div className="min-w-0">
            <span className="block truncate text-[11.5px] font-medium uppercase tracking-[0.08em] text-text-tertiary">{funil}</span>
            <h1 className="font-display text-[28px] font-extrabold leading-tight tracking-[-0.02em] text-text-primary">Negócios</h1>
          </div>
          {seletor}
        </div>
        <p className="min-w-[240px] flex-1 text-[14.5px] leading-relaxed text-text-secondary">{frase}</p>
        <div className="flex flex-wrap items-center gap-2">{acoes}</div>
      </div>
    </header>
  );
}

export function RecadoDaEva({
  recado,
  carimbo,
  onAcao,
  onDispensar,
}: {
  recado: Recado;
  carimbo: string;
  onAcao: (id: AcaoDoRecado) => void;
  onDispensar: () => void;
}) {
  return (
    <section
      aria-label="Recado da Eva"
      className="flex shrink-0 flex-wrap items-start gap-4 rounded-2xl border border-border-subtle bg-surface-1 px-5 py-4 motion-safe:animate-[eva-entra_420ms_cubic-bezier(.2,.8,.2,1)]"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-[#1d2638] text-text-primary">
        <MarcaEva />
      </span>
      <div className="flex min-w-[260px] flex-1 flex-col gap-2">
        <p className="text-[12px] text-text-tertiary">Eva · {carimbo}</p>
        <h2 className="font-display text-[21px] font-semibold leading-snug tracking-[-0.01em] text-text-primary">{recado.titulo}</h2>
        <p className="max-w-[820px] text-[14px] leading-relaxed text-text-secondary">
          {recado.partes.map((p, i) =>
            p.forte ? (
              <strong key={i} className="font-semibold text-text-primary">
                {p.texto}
              </strong>
            ) : (
              <React.Fragment key={i}>{p.texto}</React.Fragment>
            )
          )}
        </p>
        {recado.acoes.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {recado.acoes.map((a, i) => (
              <button
                key={a.id}
                type="button"
                onClick={() => onAcao(a.id)}
                className={cn(
                  "inline-flex min-h-9 items-center gap-1.5 rounded-full px-3.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-500/60",
                  i === 0
                    ? "border border-accent-500/40 bg-[#1d2638] text-[#cfdcfb] hover:border-accent-500/70"
                    : "border border-border-default text-text-secondary hover:border-border-strong hover:text-text-primary"
                )}
              >
                {i === 0 && <Sparkles size={13} aria-hidden />}
                {a.rotulo}
              </button>
            ))}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onDispensar}
        aria-label="Esconder o recado de hoje"
        title="Esconder até amanhã"
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-tertiary outline-none hover:bg-surface-2 hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60"
      >
        <X size={15} aria-hidden />
      </button>
    </section>
  );
}

export function Momentos({ itens }: { itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <ul aria-label="Momentos" className="flex shrink-0 flex-wrap gap-2">
      {itens.map((m, i) => (
        <li
          key={m}
          className="inline-flex items-center gap-2 rounded-full border border-border-default px-3 py-1.5 text-[12.5px] text-text-secondary"
        >
          {i === 0 ? (
            <Star size={13} aria-hidden style={{ color: TOM_QUENTE }} />
          ) : (
            <TrendingUp size={13} aria-hidden className="text-emerald-400" />
          )}
          {m}
        </li>
      ))}
    </ul>
  );
}

export type EstiloDaTela = "classico" | "v1" | "v2";

/**
 * Liga a voz humana do quadro (variação 2) sem passar prop por cartão:
 * cartão, coluna e chip leem daqui.
 */
export const VozDoQuadro = React.createContext(false);

/** Troca de estilo enquanto comparamos as variações. Sai quando uma for escolhida. */
export function SeletorDeEstilo({ estilo, onMudar }: { estilo: EstiloDaTela; onMudar: (e: EstiloDaTela) => void }) {
  const opcoes: [EstiloDaTela, string][] = [
    ["classico", "Atual"],
    ["v1", "Eva · 1"],
    ["v2", "Eva · 2"],
  ];
  return (
    <div role="radiogroup" aria-label="Estilo da tela" className="inline-flex items-center gap-1 rounded-full border border-border-subtle bg-surface-1 p-0.5 text-[12px]">
      <span className="px-2 text-text-tertiary">Estilo</span>
      {opcoes.map(([v, rotulo]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={estilo === v}
          onClick={() => onMudar(v)}
          className={cn(
            "h-7 rounded-full px-3 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-500/60",
            estilo === v ? "bg-surface-3 text-text-primary" : "text-text-tertiary hover:text-text-primary"
          )}
        >
          {rotulo}
        </button>
      ))}
    </div>
  );
}

/** Aviso curto quando um negócio fecha: some sozinho e não rouba o foco. */
export function Comemoracao({ titulo, detalhe, onFim }: { titulo: string; detalhe: string; onFim: () => void }) {
  React.useEffect(() => {
    const t = window.setTimeout(onFim, 5200);
    return () => window.clearTimeout(t);
  }, [onFim]);
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex max-w-[420px] items-center gap-3 rounded-2xl border border-emerald-400/35 bg-[#10201a] px-4 py-3 shadow-[0_16px_40px_rgba(0,0,0,0.5)] motion-safe:animate-[eva-comemora_5.2s_ease-in-out_forwards]"
    >
      <svg width="30" height="30" viewBox="0 0 28 28" aria-hidden className="shrink-0 motion-safe:animate-[spin_2.4s_linear_1]">
        <path
          d="M14 3v4M14 21v4M3 14h4M21 14h4M6.5 6.5l2.8 2.8M18.7 18.7l2.8 2.8M21.5 6.5l-2.8 2.8M9.3 18.7l-2.8 2.8"
          stroke="#57d6a0"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <div className="min-w-0">
        <p className="truncate text-[14px] font-semibold text-text-primary">{titulo}</p>
        <p className="text-[12.5px] text-text-secondary">{detalhe}</p>
      </div>
      <button
        type="button"
        onClick={onFim}
        aria-label="Fechar aviso"
        className="ml-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-text-tertiary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60"
      >
        <X size={14} aria-hidden />
      </button>
    </div>
  );
}

/** Desenho em linha para coluna vazia: discreto, com o tom da etapa. */
export function IlustracaoVazia({ cor }: { cor: string }) {
  return (
    <svg width="88" height="56" viewBox="0 0 96 64" aria-hidden>
      <path d="M10 54c14-22 30-30 46-24s22 2 30-12" fill="none" stroke="#3a3a44" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="86" cy="18" r="5" fill="none" stroke={cor} strokeWidth="1.6" />
      <path d="M20 54h56" stroke="#2a2a32" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
