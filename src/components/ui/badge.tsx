import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/*
 * Badge de status. Cor só em texto + fundo sutil, nunca borda colorida.
 * Use para estado (Ganho, Atrasado, Ativo), não para enfeitar rótulo.
 * "accent" é nome antigo; prefira "info" ou "neutral".
 */
const badgeVariants = cva(
  "inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-sm px-1.5 text-caption font-medium",
  {
    variants: {
      variant: {
        neutral: "bg-raised text-text-secondary",
        info: "bg-info-subtle text-info",
        success: "bg-success-subtle text-success",
        warning: "bg-warning-subtle text-warning",
        danger: "bg-danger-subtle text-danger",
        accent: "bg-accent-subtle text-accent-fg",
      },
    },
    defaultVariants: { variant: "neutral" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Pontinho à esquerda, na cor do texto (ajuda quem lê rápido a coluna). */
  dot?: boolean;
}

export function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}
