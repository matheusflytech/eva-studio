"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropdownMenuCheckboxItem, DropdownMenuSeparator } from "./dropdown-menu";
import { focusRing, overlayBox } from "./styles";
import { filterOptions, type FilterOption } from "@/lib/design-system/format";

export type { FilterOption };

/*
 * Filtro em linha: texto com seta ("Proprietário ▾"). Com seleção, o texto
 * fica forte e ganha a contagem ("Proprietário 2 ▾"). Abre um menu de
 * múltipla escolha com busca. Fica aberto enquanto se marca; Esc fecha.
 */

export function FilterButton({
  label,
  options,
  selected,
  onChange,
  searchable,
  searchPlaceholder = "Buscar",
  onSearchChange,
  className,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  /** Padrão: mostra a busca quando há mais de 7 opções. */
  searchable?: boolean;
  searchPlaceholder?: string;
  /**
   * Busca no servidor (lista grande, ex.: contatos): a tela recebe o texto e
   * troca as opções; aqui não se filtra de novo.
   */
  onSearchChange?: (q: string) => void;
  className?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const buscaRef = React.useRef<HTMLInputElement>(null);
  const listaRef = React.useRef<HTMLDivElement>(null);
  const comBusca = searchable ?? (!!onSearchChange || options.length > 7);
  const visiveis = onSearchChange ? options : filterOptions(options, busca);
  const marcados = new Set(selected);
  const n = selected.length;

  React.useEffect(() => {
    if (!aberto || !comBusca) return;
    // O Radix foca o menu ao abrir; a busca toma o foco logo depois.
    const t = window.setTimeout(() => buscaRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [aberto, comBusca]);

  function alternar(valor: string) {
    onChange(marcados.has(valor) ? selected.filter((v) => v !== valor) : [...selected, valor]);
  }

  return (
    <DropdownMenuPrimitive.Root
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (!v) {
          setBusca("");
          onSearchChange?.("");
        }
      }}
    >
      <DropdownMenuPrimitive.Trigger
        className={cn(
          "inline-flex h-8 items-center gap-1 rounded-md px-2 text-small transition-colors duration-120 hover:bg-hover",
          "data-[state=open]:bg-hover",
          n > 0 ? "font-medium text-text-primary" : "text-text-secondary",
          focusRing,
          className
        )}
        aria-label={n > 0 ? `${label}: ${n} selecionado${n > 1 ? "s" : ""}` : label}
      >
        {label}
        {n > 0 && (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-sm bg-accent-subtle px-1 text-caption font-medium tabular-nums text-accent-fg">
            {n}
          </span>
        )}
        <ChevronDown size={14} className="text-text-tertiary" aria-hidden="true" />
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          align="start"
          sideOffset={4}
          className={cn(overlayBox, "w-64 outline-none")}
        >
          {comBusca && (
            <div className="relative mb-1">
              <Search
                size={14}
                aria-hidden="true"
                className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary"
              />
              <input
                ref={buscaRef}
                value={busca}
                onChange={(e) => {
                  setBusca(e.target.value);
                  onSearchChange?.(e.target.value);
                }}
                onKeyDown={(e) => {
                  // Seta para baixo entra na lista; Esc e Tab seguem para o menu.
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    listaRef.current?.querySelector<HTMLElement>("[role=menuitemcheckbox]")?.focus();
                    return;
                  }
                  if (e.key !== "Escape" && e.key !== "Tab") e.stopPropagation();
                }}
                placeholder={searchPlaceholder}
                aria-label={`Buscar em ${label}`}
                className="h-8 w-full rounded-sm border-b border-border-subtle bg-transparent pl-7 pr-2 text-small text-text-primary outline-none placeholder:text-text-tertiary"
              />
            </div>
          )}
          <div ref={listaRef} className="max-h-64 overflow-y-auto">
            {visiveis.length === 0 ? (
              <p className="px-2 py-3 text-center text-small text-text-tertiary">Nada encontrado</p>
            ) : (
              visiveis.map((o) => (
                <DropdownMenuCheckboxItem
                  key={o.value}
                  checked={marcados.has(o.value)}
                  onCheckedChange={() => alternar(o.value)}
                  // Mantém o menu aberto para marcar várias opções.
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                  {o.hint && <span className="text-caption tabular-nums text-text-tertiary">{o.hint}</span>}
                </DropdownMenuCheckboxItem>
              ))
            )}
          </div>
          {n > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuPrimitive.Item
                onSelect={(e) => {
                  e.preventDefault();
                  onChange([]);
                }}
                className="flex h-8 cursor-pointer items-center rounded-sm px-2 text-small text-accent-fg outline-none data-[highlighted]:bg-hover"
              >
                Limpar seleção
              </DropdownMenuPrimitive.Item>
            </>
          )}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
