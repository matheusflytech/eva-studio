"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { focusRing } from "./styles";

/*
 * Alternância entre poucos modos da mesma tela (Quadro | Lista). Grupo de
 * rádio: setas trocam, o ativo fica em superfície clara. Não é filtro (para
 * filtro use FilterButton) nem aba de visão (ViewTabs).
 */
export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: React.ReactNode;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (v: T) => void;
  /** Nome do grupo para leitor de tela. */
  label: string;
  className?: string;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex h-8 items-center rounded-md border border-border-default bg-raised p-0.5", className)}>
      {options.map((o, i) => {
        const ativo = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={ativo}
            tabIndex={ativo ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const j = (i + (e.key === "ArrowRight" ? 1 : -1) + options.length) % options.length;
              onChange(options[j].value);
              refs.current[j]?.focus();
            }}
            className={cn(
              "inline-flex h-full items-center gap-1.5 rounded-sm px-2.5 text-small transition-colors duration-120 [&_svg]:size-3.5",
              ativo ? "bg-panel font-medium text-text-primary ring-1 ring-border-subtle" : "text-text-secondary hover:text-text-primary",
              focusRing
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
