import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Cabeçalho de página: título (text-heading), descrição opcional de uma
 * linha e ações à direita (no máximo um botão primário). Fica no topo do
 * conteúdo, sem cartão em volta.
 */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Linha pequena acima do título (ex.: trilha "Contatos / Visões"). */
  meta?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        {meta && <div className="mb-0.5 text-caption text-text-tertiary">{meta}</div>}
        <h1 className="text-heading text-text-primary">{title}</h1>
        {description && <p className="mt-0.5 text-body text-text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
