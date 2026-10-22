import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Estado vazio: diz o que falta e qual o próximo passo. Ícone pequeno e
 * neutro (16–20px), sem ilustração grande. compact=true para dentro de
 * tabela/coluna.
 */
export function EmptyState({
  className,
  icon,
  title,
  description,
  action,
  compact = false,
}: {
  className?: string;
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        compact ? "px-4 py-8" : "rounded-[18px] border border-border-subtle bg-panel px-6 py-14",
        className
      )}
    >
      {icon && (
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-raised text-text-tertiary [&_svg]:size-[18px]">
          {icon}
        </div>
      )}
      <h2 className="text-body font-semibold text-text-primary">{title}</h2>
      {description && <p className="mt-1 max-w-sm text-body text-text-secondary">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
