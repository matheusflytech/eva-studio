import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Barra de ferramentas acima de tabela/quadro: filtros em linha à esquerda,
 * ações (busca, exportar, colunas) à direita. role="toolbar" + rótulo.
 */
export function Toolbar({
  label,
  className,
  children,
  end,
}: {
  /** Nome para leitor de tela, ex.: "Filtros de contatos". */
  label: string;
  className?: string;
  children?: React.ReactNode;
  /** Conteúdo alinhado à direita. */
  end?: React.ReactNode;
}) {
  return (
    <div
      role="toolbar"
      aria-label={label}
      className={cn("flex min-h-10 flex-wrap items-center gap-x-1 gap-y-2", className)}
    >
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1 gap-y-2">{children}</div>
      {end && <div className="flex shrink-0 items-center gap-2">{end}</div>}
    </div>
  );
}

/** Divisor vertical fino entre grupos da barra. */
export function ToolbarSeparator() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px bg-border-default" />;
}
