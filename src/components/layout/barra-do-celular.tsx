"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { CalendarClock, Home, Menu, MessageSquare, Send } from "lucide-react";
import { usePathname } from "@/lib/contrato/navegacao";
import { useNaoLidas } from "@/components/inbox/use-nao-lidas";
import { cn } from "@/lib/utils";

const ITENS = [
  { href: "/home", rotulo: "Início", icone: Home },
  { href: "/broadcasts", rotulo: "Disparos", icone: Send },
  { href: "/conversations", rotulo: "Conversas", icone: MessageSquare },
  { href: "/scheduled", rotulo: "Agenda", icone: CalendarClock },
];

/**
 * Celular (app Disparo): barra de vidro flutuando embaixo, ao alcance do
 * polegar, com as quatro telas do dia a dia e "Mais" (o menu completo).
 */
export function BarraDoCelular({ onMais, className }: { onMais: () => void; className?: string }) {
  const pathname = usePathname();
  const naoLidas = useNaoLidas();
  const item = "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-[20px] py-1.5 text-[11px] font-medium transition-[background-color,color,scale] duration-150 active:scale-[0.94]";
  return (
    <nav
      aria-label="Navegação"
      className={cn("vidro trilho fixed inset-x-3 z-40 flex gap-1 rounded-[26px] p-1.5", className)}
      style={{ bottom: "calc(10px + env(safe-area-inset-bottom))" }}
      data-print-ocultar
    >
      {ITENS.map(({ href, rotulo, icone: Icone }) => {
        const ativo = pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            aria-current={ativo ? "page" : undefined}
            className={cn(item, ativo ? "bg-inverse text-inverse-fg" : "text-text-secondary hover:text-text-primary")}
          >
            <span className="relative">
              <Icone size={19} aria-hidden />
              {href === "/conversations" && naoLidas > 0 && <span className="absolute -right-1 -top-0.5 size-2 rounded-full bg-danger" aria-hidden />}
            </span>
            <span className="truncate">{rotulo}</span>
            {href === "/conversations" && naoLidas > 0 && <span className="sr-only">({naoLidas} não lidas)</span>}
          </Link>
        );
      })}
      <button type="button" onClick={onMais} className={cn(item, "text-text-secondary hover:text-text-primary")}>
        <Menu size={19} aria-hidden />
        <span>Mais</span>
      </button>
    </nav>
  );
}
