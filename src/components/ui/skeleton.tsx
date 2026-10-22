import * as React from "react";
import { cn } from "@/lib/utils";

/* Placeholder de carregamento no formato do conteúdo final (evita pulo de layout). */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn("animate-pulse rounded-sm bg-hover motion-reduce:animate-none", className)}
      {...props}
    />
  );
}
