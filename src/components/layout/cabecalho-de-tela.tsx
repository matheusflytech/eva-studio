"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export interface NumeroDoCabecalho {
  rotulo: string;
  valor: number;
  formatar?: (n: number) => string;
  tom?: "normal" | "perigo";
}

const inteiro = (n: number) => Math.round(n).toLocaleString("pt-BR");

/**
 * Número que sobe do zero até o valor ao abrir a tela e, depois, rola do valor
 * antigo ao novo. Contar não é movimento de tela (não gira nem desliza), então
 * vale também com "reduzir movimento" ligado no sistema.
 */
export function Contador({ valor, formatar = inteiro }: { valor: number; formatar?: (n: number) => string }) {
  const [mostrado, setMostrado] = React.useState(0);
  // Começa em 0: o efeito roda duas vezes em desenvolvimento (StrictMode) e a segunda não pode achar que já chegou.
  const atual = React.useRef(0);
  React.useEffect(() => {
    const de = atual.current;
    if (de === valor) {
      atual.current = valor;
      setMostrado(valor);
      return;
    }
    const t0 = performance.now();
    const duracao = 1400;
    let raf = requestAnimationFrame(function passo(agora) {
      const t = Math.min(1, Math.max(0, (agora - t0) / duracao));
      atual.current = de + (valor - de) * (1 - Math.pow(1 - t, 3));
      setMostrado(atual.current);
      if (t < 1) raf = requestAnimationFrame(passo);
    });
    return () => cancelAnimationFrame(raf);
  }, [valor]);
  return <span className="tabular-nums">{formatar(mostrado)}</span>;
}

/**
 * Título da tela com os números que importam ao lado, em pílulas de vidro:
 * o cabeçalho de cada tela mostra o estado do trabalho sem abrir nada.
 */
export function CabecalhoDeTela({ titulo, numeros, className }: { titulo: string; numeros?: NumeroDoCabecalho[]; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2", className)}>
      <h1 className="text-title font-semibold tracking-tight text-text-primary">{titulo}</h1>
      {numeros && numeros.length > 0 && <PilulasDeNumeros numeros={numeros} />}
    </div>
  );
}

export interface IndicadorDoCabecalho {
  icone: React.ComponentType<{ size?: number; className?: string }>;
  rotulo: string;
  valor: number;
  formatar?: (n: number) => string;
}

/** Cabeçalho do protótipo: título grande e, ao lado, indicadores com ícone em círculo de vidro, número grande e legenda. */
export function CabecalhoComIndicadores({ titulo, indicadores, className }: { titulo: string; indicadores?: IndicadorDoCabecalho[]; className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-wrap items-center justify-center gap-x-10 gap-y-4", className)}>
      <h1 className="max-w-[280px] text-[34px] font-bold leading-[1.02] tracking-[-0.035em] text-text-primary">{titulo}</h1>
      {indicadores?.map((i) => (
        <div key={i.rotulo} className="flex items-center gap-3">
          <span className="vidro relative grid size-11 shrink-0 place-items-center rounded-full text-text-secondary">
            <i.icone size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <b className="block text-[22px] font-semibold leading-tight tracking-[-0.02em] text-text-primary">
              <Contador valor={i.valor} formatar={i.formatar} />
            </b>
            <small className="text-small text-text-tertiary">{i.rotulo}</small>
          </div>
        </div>
      ))}
    </div>
  );
}

/** As pílulas de vidro com os números (a fila do cabeçalho; também usada na ficha do contato). */
export function PilulasDeNumeros({ numeros, className }: { numeros: NumeroDoCabecalho[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap items-center gap-2", className)} aria-label="Resumo">
      {numeros.map((n) => (
        <li key={n.rotulo} className="vidro relative inline-flex h-9 items-center gap-2 rounded-full px-3.5">
          <span className={cn("font-mono text-body font-semibold", n.tom === "perigo" && n.valor > 0 ? "text-danger" : "text-text-primary")}>
            <Contador valor={n.valor} formatar={n.formatar} />
          </span>
          <span className="text-caption text-text-secondary">{n.rotulo}</span>
        </li>
      ))}
    </ul>
  );
}
