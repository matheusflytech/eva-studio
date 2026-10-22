"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";
import { focusRing } from "./styles";

/*
 * Barra de ações em massa: aparece flutuando embaixo, no centro, quando há
 * linhas selecionadas ("3 selecionados · Atribuir · Mover · Apagar").
 * Quando a página inteira está marcada e o filtro tem mais resultados,
 * oferece "Selecionar todos os N resultados" (a ação vai para o servidor pelo
 * filtro, não pela lista de ids). Ações = Button size="sm" variant="ghost"
 * (destrutiva por último). Sombra só aqui porque é camada flutuante.
 */

const numero = new Intl.NumberFormat("pt-BR");

export function BulkActionBar({
  count,
  total,
  allResults = false,
  canSelectAll = false,
  onSelectAll,
  onClear,
  noun = ["selecionado", "selecionados"],
  limitNote,
  children,
  className,
}: {
  /** Quantas linhas marcadas (ou o total, quando `allResults`). */
  count: number;
  /** Total de resultados do filtro. */
  total?: number;
  /** Seleção é "todos os resultados do filtro". */
  allResults?: boolean;
  /** Mostra o link "Selecionar todos os N resultados". */
  canSelectAll?: boolean;
  onSelectAll?: () => void;
  onClear: () => void;
  noun?: [string, string];
  /** Aviso do limite (ex.: "a ação vale para os primeiros 5.000"). */
  limitNote?: string;
  children: React.ReactNode;
  className?: string;
}) {
  if (count <= 0) return null;
  return (
    <div
      role="toolbar"
      aria-label="Ações em massa"
      className={cn(
        "fixed bottom-4 left-1/2 z-40 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-lg border border-border-default bg-overlay px-2 py-1.5 text-small text-text-primary shadow-overlay",
        "motion-safe:animate-[ds-fade-in_160ms_var(--ease-standard)]",
        className
      )}
    >
      <span className="whitespace-nowrap px-2 font-medium tabular-nums" aria-live="polite">
        {allResults ? `Todos os ${numero.format(count)}` : numero.format(count)} {count === 1 ? noun[0] : noun[1]}
      </span>
      {canSelectAll && !allResults && total !== undefined && total > count && onSelectAll && (
        <button type="button" onClick={onSelectAll} className={cn("whitespace-nowrap rounded-sm px-1 text-accent-fg hover:underline", focusRing)}>
          Selecionar todos os {numero.format(total)} resultados
        </button>
      )}
      {allResults && limitNote && <span className="whitespace-nowrap px-1 text-caption text-text-tertiary">{limitNote}</span>}
      <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border-subtle" />
      <div className="flex items-center gap-0.5">{children}</div>
      <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border-subtle" />
      <IconButton aria-label="Limpar seleção" tooltip size="sm" onClick={onClear}>
        <X />
      </IconButton>
    </div>
  );
}
