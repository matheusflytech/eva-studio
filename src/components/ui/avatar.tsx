import * as React from "react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/design-system/format";

/*
 * Avatar: foto ou iniciais em cinza neutro. Sem cor aleatória por pessoa
 * (vira arco-íris numa tabela de 25 linhas).
 */
const tamanhos = { sm: "h-6 w-6 text-caption", md: "h-8 w-8 text-small", lg: "h-10 w-10 text-body" } as const;

export function Avatar({
  name,
  src,
  size = "sm",
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof tamanhos;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-hover font-medium text-text-secondary",
        tamanhos[size],
        className
      )}
      title={name}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span aria-label={name} role="img">
          {initials(name)}
        </span>
      )}
    </span>
  );
}
