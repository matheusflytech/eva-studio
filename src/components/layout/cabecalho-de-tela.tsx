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
