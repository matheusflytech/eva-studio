"use client";

import * as React from "react";
import { ChevronsLeftRight, ChevronsRightLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";
import { focusRing } from "./styles";
import { formatMoney } from "@/lib/design-system/format";

export { formatMoney };

/*
 * Casca de coluna do quadro (sem drag-and-drop; isso fica na tela).
 * Cabeçalho simples (nome + contagem + recolher), corpo rolável com os
 * cartões e rodapé com Total e Ponderado. Recolhida vira uma faixa estreita
 * com o nome na vertical.
 */

export function KanbanColumn({
  title,
  count,
  total,
  weighted,
  collapsed = false,
  onCollapsedChange,
  children,
  className,
}: {
  title: string;
  count: number;
  /** Soma dos valores (reais). */
  total?: number;
  /** Soma ponderada pela probabilidade da etapa (reais). */
  weighted?: number;
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  children?: React.ReactNode;
  className?: string;
}) {
  const corpoId = React.useId();

  if (collapsed) {
    return (
      <section
        aria-label={`${title}, ${count} itens (recolhida)`}
        className={cn("flex w-10 shrink-0 flex-col items-center rounded-lg border border-border-subtle bg-raised py-2", className)}
      >
        <button
          type="button"
          aria-expanded={false}
          onClick={() => onCollapsedChange?.(false)}
          className={cn("flex flex-1 flex-col items-center gap-2 rounded-sm px-1 text-text-secondary hover:text-text-primary", focusRing)}
        >
          <ChevronsLeftRight size={14} aria-hidden="true" />
          <span className="text-small font-medium [writing-mode:vertical-rl]">{title}</span>
          <span className="text-caption tabular-nums text-text-tertiary">{count}</span>
        </button>
      </section>
    );
  }

  return (
    <section
      aria-label={`${title}, ${count} itens`}
      className={cn("flex w-72 shrink-0 flex-col rounded-lg border border-border-subtle bg-raised", className)}
    >
      <header className="flex h-10 items-center gap-2 border-b border-border-subtle pl-3 pr-1.5">
        <h3 className="min-w-0 flex-1 truncate text-small font-semibold text-text-primary">{title}</h3>
        <span className="text-small tabular-nums text-text-tertiary">{count}</span>
        {onCollapsedChange && (
          <IconButton
            aria-label={`Recolher ${title}`}
            aria-expanded={true}
            aria-controls={corpoId}
            size="sm"
            onClick={() => onCollapsedChange(true)}
          >
            <ChevronsRightLeft />
          </IconButton>
        )}
      </header>
      <div id={corpoId} className="flex min-h-24 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
        {children}
      </div>
      {(total !== undefined || weighted !== undefined) && (
        <footer className="grid grid-cols-2 gap-2 border-t border-border-subtle px-3 py-2 text-caption">
          {total !== undefined && (
            <span className="flex flex-col">
              <span className="text-text-tertiary">Total</span>
              <span className="font-medium tabular-nums text-text-primary">{formatMoney(total)}</span>
            </span>
          )}
          {weighted !== undefined && (
            <span className="flex flex-col text-right">
              <span className="text-text-tertiary">Ponderado</span>
              <span className="font-medium tabular-nums text-text-primary">{formatMoney(weighted)}</span>
            </span>
          )}
        </footer>
      )}
    </section>
  );
}

/** Cartão simples do quadro: título, linha secundária, valor e metadado. */
export function KanbanCard({
  title,
  subtitle,
  value,
  meta,
  onClick,
  className,
}: {
  title: string;
  subtitle?: React.ReactNode;
  value?: number;
  /** Rodapé à direita (ex.: avatar do dono, data). */
  meta?: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "flex w-full flex-col gap-1 rounded-md border border-border-subtle bg-panel px-2.5 py-2 text-left",
        onClick && "transition-colors duration-120 hover:border-border-strong",
        onClick && focusRing,
        className
      )}
    >
      <span className="truncate text-small font-medium text-text-primary">{title}</span>
      {subtitle && <span className="truncate text-caption text-text-secondary">{subtitle}</span>}
      {(value !== undefined || meta) && (
        <span className="mt-0.5 flex items-center justify-between gap-2">
          {value !== undefined ? (
            <span className="text-small font-medium tabular-nums text-text-primary">{formatMoney(value)}</span>
          ) : (
            <span />
          )}
          {meta && <span className="flex items-center gap-1.5 text-caption text-text-tertiary">{meta}</span>}
        </span>
      )}
    </Tag>
  );
}
