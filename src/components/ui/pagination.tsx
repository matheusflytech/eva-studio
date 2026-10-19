"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { PAGE_SIZES, formatPageRange, pageItems, totalPages } from "@/lib/design-system/pagination";
import { focusRing } from "./styles";

/*
 * Paginação numerada: "Itens por página 25 ▾  ·  1–25 de 24.752" à
 * esquerda; "Anterior 1 … 4 5 6 … 991 Próximo" à direita.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = PAGE_SIZES,
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizes?: readonly number[];
  className?: string;
}) {
  const paginas = totalPages(total, pageSize);
  const itens = pageItems(page, paginas);
  const tamanhoId = React.useId();

  const botao = cn(
    "inline-flex h-7 min-w-7 items-center justify-center gap-1 rounded-md px-2 text-small tabular-nums transition-colors duration-120",
    "text-text-secondary hover:bg-hover hover:text-text-primary disabled:pointer-events-none disabled:text-text-disabled",
    focusRing
  );

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-small", className)}>
      <div className="flex items-center gap-4 text-text-secondary">
        {onPageSizeChange && (
          <span className="flex items-center gap-2">
            <label htmlFor={tamanhoId}>Itens por página</label>
            <select
              id={tamanhoId}
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className={cn(
                "h-7 rounded-md border border-border-default bg-panel px-1.5 text-small tabular-nums text-text-primary hover:border-border-strong",
                focusRing
              )}
            >
              {pageSizes.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </span>
        )}
        <span className="tabular-nums" aria-live="polite">
          {formatPageRange(page, pageSize, total)}
        </span>
      </div>

      <nav aria-label="Paginação" className="flex items-center gap-0.5">
        <button type="button" className={botao} disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          <ChevronLeft size={14} aria-hidden="true" />
          Anterior
        </button>
        {itens.map((it) =>
          typeof it === "number" ? (
            <button
              key={it}
              type="button"
              aria-label={`Página ${it}`}
              aria-current={it === page ? "page" : undefined}
              onClick={() => onPageChange(it)}
              className={cn(botao, it === page && "bg-raised font-medium text-text-primary ring-1 ring-inset ring-border-default")}
            >
              {it.toLocaleString("pt-BR")}
            </button>
          ) : (
            <span key={it} aria-hidden="true" className="inline-flex h-7 w-6 items-center justify-center text-text-tertiary">
              …
            </span>
          )
        )}
        <button type="button" className={botao} disabled={page >= paginas} onClick={() => onPageChange(page + 1)}>
          Próximo
          <ChevronRight size={14} aria-hidden="true" />
        </button>
      </nav>
    </div>
  );
}
