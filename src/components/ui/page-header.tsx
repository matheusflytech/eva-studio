import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Cabeçalho de página: título (text-heading em Plus Jakarta 700), descrição opcional de uma
 * linha e ações à direita (no máximo um botão primário). Fica no topo do
 * conteúdo, sem cartão em volta.
 */
export function PageHeader({
  title,
  description,
  actions,
  meta,
  eyebrow,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  /** Linha pequena acima do título (ex.: trilha "Contatos / Visões"). */
  meta?: React.ReactNode;
  /** Rótulo de seção no estilo da marca (mono, caixa alta, acento). */
  eyebrow?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
        {meta && <div className="mb-0.5 font-mono text-caption text-text-tertiary">{meta}</div>}
        <h1 className="text-heading font-semibold tracking-[-0.025em] text-text-primary">{title}</h1>
        {description && <p className="mt-0.5 text-small text-text-secondary">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
