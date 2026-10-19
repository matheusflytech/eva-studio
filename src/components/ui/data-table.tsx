"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ariaSort,
  nextSort,
  pageSelectionState,
  togglePageSelection,
  type SortState,
} from "@/lib/design-system/pagination";
import { Checkbox } from "./checkbox";
import { Skeleton } from "./skeleton";
import { focusRing } from "./styles";

/*
 * Tabela de dados densa. Cabeçalho fixo e claro, linhas de 40px com hover,
 * números à direita e tabulares, ordenação por coluna (aria-sort), seleção
 * por checkbox com "selecionar página", estados vazio e carregando.
 *
 * Ordenação e paginação são controladas por fora (a lista grande ordena no
 * servidor). Para listas pequenas, sortRows() de lib/design-system ordena local.
 */

export interface DataTableColumn<T> {
  key: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  /** Número/moeda: alinha à direita e usa algarismos tabulares. */
  numeric?: boolean;
  sortable?: boolean;
  /** Largura CSS (ex.: "220px", "12rem"). Sem largura, a coluna divide o resto. */
  width?: string;
  /** Esconde o rótulo do cabeçalho (coluna de ações), mantendo para leitor de tela. */
  hideHeader?: boolean;
}

export interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  /** Nome da linha para o checkbox ("Selecionar Ana Souza"). */
  getRowLabel?: (row: T) => string;
  /** Descrição da tabela para leitor de tela. */
  caption: string;
  sort?: SortState | null;
  onSortChange?: (sort: SortState | null) => void;
  selected?: Set<string>;
  onSelectedChange?: (selected: Set<string>) => void;
  loading?: boolean;
  /** Linhas de esqueleto enquanto carrega. */
  loadingRows?: number;
  empty?: React.ReactNode;
  onRowClick?: (row: T) => void;
  /** Classe do contêiner de rolagem (ex.: "max-h-[640px]" para fixar o cabeçalho). */
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  getRowLabel,
  caption,
  sort = null,
  onSortChange,
  selected,
  onSelectedChange,
  loading = false,
  loadingRows = 8,
  empty,
  onRowClick,
  className,
}: DataTableProps<T>) {
  const selecionavel = Boolean(selected && onSelectedChange);
  const chavesDaPagina = rows.map(getRowKey);
  const estadoPagina = selected ? pageSelectionState(chavesDaPagina, selected) : "none";
  const totalColunas = columns.length + (selecionavel ? 1 : 0);

  return (
    <div className={cn("relative w-full overflow-auto", className)}>
      <table className="w-max min-w-full border-separate border-spacing-0 text-small">
        <caption className="sr-only">{caption}</caption>
        <colgroup>
          {selecionavel && <col style={{ width: 40 }} />}
          {columns.map((c) => (
            <col key={c.key} style={c.width ? { width: c.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {selecionavel && (
              <th scope="col" className={thBase}>
                <span className="flex items-center justify-center">
                  <Checkbox
                    aria-label="Selecionar página"
                    disabled={loading || rows.length === 0}
                    checked={estadoPagina === "all" ? true : estadoPagina === "some" ? "indeterminate" : false}
                    onCheckedChange={() => onSelectedChange?.(togglePageSelection(chavesDaPagina, selected!))}
                  />
                </span>
              </th>
            )}
            {columns.map((c) => {
              const ordenavel = c.sortable && onSortChange;
              const direcao = ariaSort(sort, c.key);
              const Seta = direcao === "ascending" ? ArrowUp : direcao === "descending" ? ArrowDown : ArrowUpDown;
              return (
                <th
                  key={c.key}
                  scope="col"
                  aria-sort={ordenavel ? direcao : undefined}
                  className={cn(thBase, "px-3", c.numeric ? "text-right" : "text-left")}
                >
                  {c.hideHeader ? (
                    <span className="sr-only">{c.header}</span>
                  ) : ordenavel ? (
                    <button
                      type="button"
                      onClick={() => onSortChange(nextSort(sort, c.key))}
                      className={cn(
                        "group -mx-1 inline-flex items-center gap-1 rounded-sm px-1 hover:text-text-primary",
                        c.numeric && "flex-row-reverse",
                        direcao !== "none" && "text-text-primary",
                        focusRing
                      )}
                    >
                      {c.header}
                      <Seta
                        size={12}
                        aria-hidden="true"
                        className={cn(direcao === "none" && "opacity-0 group-hover:opacity-60 group-focus-visible:opacity-60")}
                      />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: loadingRows }, (_, i) => (
              <tr key={`sk-${i}`} aria-hidden="true">
                {selecionavel && <td className={tdBase} />}
                {columns.map((c) => (
                  <td key={c.key} className={cn(tdBase, "px-3")}>
                    <Skeleton className={cn("h-3", c.numeric ? "ml-auto w-16" : i % 2 ? "w-2/3" : "w-1/2")} />
                  </td>
                ))}
              </tr>
            ))
          ) : rows.length === 0 ? (
            <tr>
              <td colSpan={totalColunas} className="border-b border-border-subtle">
                {empty ?? <p className="py-10 text-center text-body text-text-secondary">Nenhum registro.</p>}
              </td>
            </tr>
          ) : (
            rows.map((row) => {
              const k = getRowKey(row);
              const marcado = selected?.has(k) ?? false;
              return (
                <tr
                  key={k}
                  aria-selected={selecionavel ? marcado : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "transition-colors duration-120",
                    marcado ? "bg-accent-subtle" : "hover:bg-raised",
                    onRowClick && "cursor-pointer"
                  )}
                >
                  {selecionavel && (
                    <td className={tdBase} onClick={(e) => e.stopPropagation()}>
                      <span className="flex items-center justify-center">
                        <Checkbox
                          aria-label={`Selecionar ${getRowLabel?.(row) ?? "linha"}`}
                          checked={marcado}
                          onCheckedChange={() => {
                            const novo = new Set(selected);
                            if (marcado) novo.delete(k);
                            else novo.add(k);
                            onSelectedChange?.(novo);
                          }}
                        />
                      </span>
                    </td>
                  )}
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={cn(
                        tdBase,
                        "whitespace-nowrap px-3 text-text-primary",
                        c.numeric && "text-right tabular-nums"
                      )}
                    >
                      {c.cell(row)}
                    </td>
                  ))}
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

const thBase =
  "sticky top-0 z-10 h-9 whitespace-nowrap border-b border-border-default bg-raised text-small font-medium text-text-secondary";
const tdBase = "h-10 border-b border-border-subtle";
