import * as React from "react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/design-system/format";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import type { CategoryColor } from "@/lib/design-system/tokens";

// Foto do contato: as iniciais num círculo com cor de categoria tirada do id.
// Aqui a cor é identidade (o mesmo contato tem sempre a mesma cor na lista,
// na ficha e na agenda), por isso não usa o Avatar cinza da tabela.

const CORES: CategoryColor[] = ["blue", "cyan", "teal", "green", "amber", "orange", "red", "rose", "violet", "purple", "indigo"];

function corDa(semente: string): CategoryColor {
  let h = 0;
  for (let i = 0; i < semente.length; i++) h = (h * 31 + semente.charCodeAt(i)) | 0;
  return CORES[Math.abs(h) % CORES.length];
}

const TAMANHOS = {
  xs: "size-5", // 20px: só a cor, as iniciais não cabem legíveis
  sm: "size-6 text-caption",
  md: "size-9.5 text-small",
  lg: "size-23 text-title",
  xl: "size-24 text-title",
} as const;

export function FotoDoContato({
  nome,
  semente,
  tamanho = "md",
  className,
}: {
  nome: string;
  /** O que decide a cor (o id do contato). */
  semente: string;
  tamanho?: keyof typeof TAMANHOS;
  className?: string;
}) {
  const cor = CATEGORY_CLASSES[corDa(semente || nome)];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        cor.subtle,
        cor.fg,
        TAMANHOS[tamanho],
        className
      )}
    >
      {tamanho === "xs" ? null : initials(nome)}
    </span>
  );
}
