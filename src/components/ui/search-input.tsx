"use client";

import * as React from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "./input";
import { focusRing } from "./styles";

/*
 * Busca da barra da lista: lupa à esquerda, "×" para limpar quando há texto.
 * O rótulo vai em aria-label (a barra não tem espaço para rótulo visível; o
 * placeholder diz o que dá para buscar).
 */
export const SearchInput = React.forwardRef<
  HTMLInputElement,
  Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange" | "value"> & {
    value: string;
    onValueChange: (v: string) => void;
    "aria-label": string;
  }
>(({ value, onValueChange, className, ...props }, ref) => {
  return (
    <div className={cn("relative", className)}>
      <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
      <Input
        ref={ref}
        type="search"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        className="pl-8 pr-8 [&::-webkit-search-cancel-button]:hidden"
        {...props}
      />
      {value && (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => onValueChange("")}
          className={cn("absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-sm text-text-tertiary hover:text-text-primary", focusRing)}
        >
          <X size={14} aria-hidden="true" />
        </button>
      )}
    </div>
  );
});
SearchInput.displayName = "SearchInput";
