import * as React from "react";
import { cn } from "@/lib/utils";

/*
 * Card / Panel: superfície panel com borda fina neutra. Sem sombra, sem blur,
 * sem borda colorida. Panel é o nome novo (padding menor, para telas densas);
 * Card mantém a API antiga.
 */
export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[18px] border border-border-subtle bg-panel p-5 print:break-inside-avoid", className)} {...props} />;
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-4 flex flex-col gap-0.5", className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-title-sm text-text-primary", className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-small text-text-secondary", className)} {...props} />;
}

export interface PanelProps extends Omit<React.HTMLAttributes<HTMLElement>, "title"> {
  /** Título no cabeçalho do painel (com linha divisória). */
  title?: React.ReactNode;
  /** Ações à direita do título. */
  actions?: React.ReactNode;
  /** Remove o padding do corpo (para tabela encostada na borda). */
  flush?: boolean;
  as?: "section" | "div" | "article";
}

export function Panel({ className, title, actions, flush, as: Tag = "section", children, ...props }: PanelProps) {
  return (
    <Tag className={cn("rounded-[18px] border border-border-subtle bg-panel", className)} {...props}>
      {(title || actions) && (
        <header className="flex min-h-11 items-center justify-between gap-3 border-b border-border-subtle px-4 py-2">
          {title && <h2 className="text-body font-semibold text-text-primary">{title}</h2>}
          {actions && <div className="flex items-center gap-1.5">{actions}</div>}
        </header>
      )}
      <div className={flush ? undefined : "p-4"}>{children}</div>
    </Tag>
  );
}
