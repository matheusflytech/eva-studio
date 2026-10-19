"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { IconButton } from "./icon-button";
import { focusRing } from "./styles";

/*
 * Abas de visão de uma lista ("Todos os contatos 24.752", "Meus contatos 312")
 * com "+" para criar visão. Setas esquerda/direita navegam entre as abas
 * (padrão tablist com tabindex móvel).
 */

export interface ViewTab {
  id: string;
  label: string;
  count?: number;
}

const numero = new Intl.NumberFormat("pt-BR");

export function ViewTabs({
  views,
  value,
  onChange,
  onAdd,
  addLabel = "Adicionar visão",
  label = "Visões",
  className,
}: {
  views: ViewTab[];
  value: string;
  onChange: (id: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  /** Nome do grupo para leitor de tela. */
  label?: string;
  className?: string;
}) {
  const refs = React.useRef<Map<string, HTMLButtonElement>>(new Map());

  function mover(de: number, passo: number) {
    const i = (de + passo + views.length) % views.length;
    const alvo = views[i];
    onChange(alvo.id);
    refs.current.get(alvo.id)?.focus();
  }

  return (
    <div className={cn("flex items-end gap-1 border-b border-border-subtle", className)}>
      <div role="tablist" aria-label={label} className="flex min-w-0 items-end gap-5 overflow-x-auto">
        {views.map((v, i) => {
          const ativo = v.id === value;
          return (
            <button
              key={v.id}
              ref={(el) => {
                if (el) refs.current.set(v.id, el);
                else refs.current.delete(v.id);
              }}
              type="button"
              role="tab"
              aria-selected={ativo}
              tabIndex={ativo ? 0 : -1}
              onClick={() => onChange(v.id)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight") {
                  e.preventDefault();
                  mover(i, 1);
                } else if (e.key === "ArrowLeft") {
                  e.preventDefault();
                  mover(i, -1);
                } else if (e.key === "Home") {
                  e.preventDefault();
                  mover(0, 0);
                } else if (e.key === "End") {
                  e.preventDefault();
                  mover(views.length - 1, 0);
                }
              }}
              className={cn(
                "-mb-px inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 text-body transition-colors duration-120",
                ativo
                  ? "border-text-primary font-medium text-text-primary"
                  : "border-transparent text-text-secondary hover:text-text-primary",
                focusRing
              )}
            >
              {v.label}
              {v.count !== undefined && (
                <span className="text-small tabular-nums text-text-tertiary">{numero.format(v.count)}</span>
              )}
            </button>
          );
        })}
      </div>
      {onAdd && (
        <IconButton aria-label={addLabel} tooltip size="sm" className="mb-1" onClick={onAdd}>
          <Plus />
        </IconButton>
      )}
    </div>
  );
}
