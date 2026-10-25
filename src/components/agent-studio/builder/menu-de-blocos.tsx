"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { PALETTE_GROUPS } from "./palette-groups";
import { IconeDoBloco } from "./icone-do-bloco";
import type { IconKey } from "./icon-registry";

// ---------------------------------------------------------------------------
// "O que vem depois?" direto no canvas: o "+" de uma saída livre (ou o
// "+ ferramenta" da IA) abre a mesma lista da paleta, já agrupada. O bloco
// escolhido nasce ligado naquele ponto: ninguém precisa arrastar fio.
// ---------------------------------------------------------------------------

export function MenuDeBlocos({
  ferramentas,
  escolher,
  rotulo,
  className,
  children,
}: {
  /** true: só as ferramentas da IA; false: só os passos do fluxo. */
  ferramentas: boolean;
  escolher: (iconKey: IconKey) => void;
  /** Nome acessível do botão. */
  rotulo: string;
  className?: string;
  /** Conteúdo do botão (padrão: um "+"). */
  children?: React.ReactNode;
}) {
  const grupos = PALETTE_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !!i.tool === ferramentas && i.key !== "start") })).filter(
    (g) => g.items.length > 0
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={rotulo}
          title={rotulo}
          // nodrag/nopan: clicar no "+" não arrasta o bloco nem move o canvas.
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "nodrag nopan flex items-center justify-center rounded-full border border-border-default bg-panel text-text-tertiary transition-colors hover:border-accent-solid hover:bg-accent-solid hover:text-text-on-accent",
            className
          )}
        >
          {children ?? <Plus size={11} aria-hidden="true" />}
        </button>
      </DropdownMenuTrigger>
      {/* Altura limitada ao espaço livre que o Radix mede: perto da borda o menu rola em vez de sair da tela. */}
      <DropdownMenuContent
        align="start"
        collisionPadding={12}
        className="max-h-[min(60vh,var(--radix-dropdown-menu-content-available-height))] w-64 overflow-y-auto overscroll-contain"
      >
        {grupos.map((g, gi) => (
          <React.Fragment key={g.id}>
            {gi > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel>{g.label}</DropdownMenuLabel>
            {g.items.map((i) => (
              <DropdownMenuItem key={i.key} onSelect={() => escolher(i.key)} className="items-start gap-2.5">
                <IconeDoBloco iconKey={i.key} size={15} className="mt-0.5 shrink-0 text-text-secondary" />
                <span className="min-w-0">
                  <span className="block text-small text-text-primary">{i.label}</span>
                  <span className="block truncate text-caption text-text-tertiary">{i.hint}</span>
                </span>
              </DropdownMenuItem>
            ))}
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
