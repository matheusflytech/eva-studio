"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropdownMenuSeparator } from "./dropdown-menu";
import { Button } from "./button";
import { Input } from "./input";
import { focusRing, menuItemBase, overlayBox } from "./styles";
import { PERIODOS_PRONTOS, periodoParaTexto, rotuloDoPeriodo, type Periodo } from "@/lib/listas/estado-da-lista";

/*
 * Filtro de data em linha ("Criado em ▾"), irmão do FilterButton: escolha
 * única entre períodos prontos (hoje, 7/30/90 dias, este mês) ou um
 * intervalo de datas. Com período escolhido, o texto fica forte e mostra o
 * período ("Criado em: Últimos 30 dias ▾").
 */
export function DateFilterButton({
  label,
  value,
  onChange,
  className,
}: {
  label: string;
  value: Periodo | null;
  onChange: (p: Periodo | null) => void;
  className?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const [de, setDe] = React.useState(value?.tipo === "entre" ? value.de : "");
  const [ate, setAte] = React.useState(value?.tipo === "entre" ? value.ate : "");
  const atual = value ? periodoParaTexto(value) : "";

  function escolher(p: Periodo | null) {
    onChange(p);
    setAberto(false);
  }

  return (
    <DropdownMenuPrimitive.Root
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) {
          setDe(value?.tipo === "entre" ? value.de : "");
          setAte(value?.tipo === "entre" ? value.ate : "");
        }
      }}
    >
      <DropdownMenuPrimitive.Trigger
        className={cn(
          "inline-flex h-8 max-w-72 items-center gap-1 rounded-md px-2 text-small transition-colors duration-120 hover:bg-hover",
          "data-[state=open]:bg-hover",
          value ? "font-medium text-text-primary" : "text-text-secondary",
          focusRing,
          className
        )}
        aria-label={value ? `${label}: ${rotuloDoPeriodo(value)}` : label}
      >
        <span className="truncate">
          {label}
          {value && <span className="font-normal text-text-secondary">: {rotuloDoPeriodo(value)}</span>}
        </span>
        <ChevronDown size={14} className="shrink-0 text-text-tertiary" aria-hidden="true" />
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content align="start" sideOffset={4} className={cn(overlayBox, "w-80 outline-none")}>
          {PERIODOS_PRONTOS.map((o) => {
            const marcado = atual === periodoParaTexto(o.periodo);
            return (
              <DropdownMenuPrimitive.Item
                key={o.id}
                onSelect={() => escolher(o.periodo)}
                className={cn(menuItemBase, "relative pl-7")}
                aria-checked={marcado}
                role="menuitemradio"
              >
                {marcado && <Check size={14} aria-hidden="true" className="absolute left-2 text-accent-fg" />}
                {o.rotulo}
              </DropdownMenuPrimitive.Item>
            );
          })}
          <DropdownMenuSeparator />
          <form
            className="flex flex-col gap-2 px-2 py-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (de && ate) escolher(de <= ate ? { tipo: "entre", de, ate } : { tipo: "entre", de: ate, ate: de });
            }}
            // O menu do Radix captura as teclas; dentro do formulário elas são do campo.
            onKeyDown={(e) => {
              if (e.key !== "Escape") e.stopPropagation();
            }}
          >
            <span className="text-caption font-medium text-text-tertiary">Intervalo</span>
            <div className="flex items-center gap-1.5">
              <Input type="date" aria-label="De" value={de} onChange={(e) => setDe(e.target.value)} className="h-7 px-1.5 text-small" />
              <span className="text-caption text-text-tertiary">a</span>
              <Input type="date" aria-label="Até" value={ate} onChange={(e) => setAte(e.target.value)} className="h-7 px-1.5 text-small" />
            </div>
            <Button type="submit" variant="secondary" size="sm" disabled={!de || !ate}>
              Aplicar intervalo
            </Button>
          </form>
          {value && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuPrimitive.Item
                onSelect={() => escolher(null)}
                className="flex h-8 cursor-pointer items-center rounded-sm px-2 text-small text-accent-fg outline-none data-[highlighted]:bg-hover"
              >
                Limpar
              </DropdownMenuPrimitive.Item>
            </>
          )}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
