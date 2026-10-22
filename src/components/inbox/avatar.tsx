import * as React from "react";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import { corPorHash, iniciais } from "./tipos";

const TAMANHOS = {
  sm: "h-8 w-8 text-caption [&_svg]:size-3.5",
  md: "h-9 w-9 text-caption [&_svg]:size-4",
  lg: "h-10 w-10 text-small [&_svg]:size-4.5",
} as const;

/**
 * Avatar do contato com cor fixa por pessoa. Na caixa de entrada a cor ajuda a
 * achar de novo a mesma pessoa na lista, na conversa e no painel; por isso a
 * chave é sempre o contactId da conversa, nos três lugares.
 */
export function AvatarDoContato({
  chave, nome, tamanho = "md", className,
}: {
  chave: string;
  nome: string;
  tamanho?: keyof typeof TAMANHOS;
  className?: string;
}) {
  const cor = CATEGORY_CLASSES[corPorHash(chave)];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full font-semibold",
        cor.subtle, cor.fg, TAMANHOS[tamanho], className
      )}
    >
      {iniciais(nome) || <UserRound />}
    </span>
  );
}

/** Quadrado do agente (a "caixa"): cor fixa pelo id e a inicial do nome. */
export function QuadradoDoAgente({
  id, nome, tamanho = "md", className,
}: {
  id: string;
  nome: string;
  tamanho?: "xs" | "sm" | "md";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 select-none items-center justify-center font-bold text-text-on-accent",
        CATEGORY_CLASSES[corPorHash(id)].solid,
        tamanho === "md" && "h-6 w-6 rounded-[7px] text-caption",
        tamanho === "sm" && "h-5 w-5 rounded-md text-caption",
        tamanho === "xs" && "h-3.5 w-3.5 rounded-[4px]",
        className
      )}
    >
      {/* No menor não cabe letra legível: fica só a cor. */}
      {tamanho !== "xs" && nome.trim().charAt(0).toUpperCase()}
    </span>
  );
}
