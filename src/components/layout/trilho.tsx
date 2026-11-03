"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { useSearchParams } from "next/navigation";
import { usePathname } from "@/lib/contrato/navegacao";
import { CalendarDays, Contact, Handshake, Plus, Search, Settings, Aperture } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBuscaGlobal } from "@/components/busca/paleta-de-busca";
import { ThemeToggle } from "@/components/ui/theme";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NAV_AVANCADO } from "./navegacao";

/** Texto do atalho: só aparece quando o trilho abre (mouse em cima ou foco dentro). */
function Rotulo({ texto }: { texto: string }) {
  return (
    <span className="whitespace-nowrap text-[13px] font-medium opacity-0 transition-opacity duration-150 group-hover/trilho:opacity-100 group-focus-within/trilho:opacity-100">
      {texto}
    </span>
  );
}

const BOTAO = cn(
  "relative flex h-[42px] w-full shrink-0 items-center gap-3 overflow-hidden rounded-full px-[12.5px] text-text-secondary transition-[background-color,color,scale] duration-150",
  "hover:bg-hover hover:text-text-primary active:scale-[0.92] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
);

function Dica({ texto, children }: { texto: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{texto}</TooltipContent>
    </Tooltip>
  );
}

/** Atalho do trilho que leva a uma tela; fica "aceso" quando é a tela atual. */
function AtalhoDeTela({ href, rotulo, ativo, children }: { href: string; rotulo: string; ativo: boolean; children: React.ReactNode }) {
  return (
    <Dica texto={rotulo}>
      <Link href={href} aria-label={rotulo} aria-current={ativo ? "page" : undefined} className={cn(BOTAO, ativo && "bg-hover text-text-primary")}>
        {children}
        <Rotulo texto={rotulo} />
      </Link>
    </Dica>
  );
}

/**
 * Trilho do computador (pílula de vidro à esquerda): buscar, criar, o seu dia,
 * a agenda e todas as ferramentas que não cabem nas abas do topo, mais os
 * ajustes e o tema embaixo. Nada saiu do menu antigo: o que não está nas abas
 * está em "Mais ferramentas".
 */
export function Trilho({ className }: { className?: string }) {
  const { abrir, mac } = useBuscaGlobal();
  const pathname = usePathname();
  const aba = useSearchParams().get("tab");
  const naAgenda = pathname === "/tasks" && aba === "calendar";
  return (
    <aside
      aria-label="Atalhos"
      className={cn("vidro group/trilho absolute left-3.5 top-1/2 z-30 -translate-y-1/2 flex w-[60px] flex-col items-stretch gap-1 overflow-hidden rounded-[30px] px-2 py-2.5 transition-[width] duration-200 ease-out hover:w-[212px] focus-within:w-[212px] motion-reduce:transition-none", className)}
      style={{ maxHeight: "min(820px, calc(100% - 12px))" }}
      data-print-ocultar
    >
      <Dica texto={`Buscar (${mac ? "⌘K" : "Ctrl+K"})`}>
        <button type="button" onClick={abrir} aria-label="Buscar" aria-keyshortcuts={mac ? "Meta+K" : "Control+K"} className={BOTAO}>
          <Search size={19} aria-hidden className="shrink-0" />
          <Rotulo texto="Buscar" />
        </button>
      </Dica>

      <DropdownMenu>
        <Dica texto="Criar">
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Criar" className={BOTAO}>
              <Plus size={19} aria-hidden className="shrink-0" />
              <Rotulo texto="Criar" />
            </button>
          </DropdownMenuTrigger>
        </Dica>
        <DropdownMenuContent side="right" align="start" sideOffset={12} className="w-52">
          <DropdownMenuLabel>Criar</DropdownMenuLabel>
          <DropdownMenuItem asChild>
            <Link href="/deals?new=1">
              <Handshake size={15} aria-hidden /> Novo negócio
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/contacts?new=1">
              <Contact size={15} aria-hidden /> Novo contato
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/agent-studio/new">
              <Aperture size={15} aria-hidden /> Novo agente
            </Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AtalhoDeTela href="/tasks?tab=calendar" rotulo="Agenda" ativo={naAgenda}>
        <CalendarDays size={19} aria-hidden className="shrink-0" />
      </AtalhoDeTela>

      <span aria-hidden="true" className="my-2 h-px w-6 shrink-0 self-center bg-border-subtle" />

      {/* As ferramentas direto no trilho, em grupos; rola quando a janela é baixa. */}
      <nav aria-label="Ferramentas" className="flex min-h-0 w-full flex-1 flex-col items-stretch gap-1 overflow-y-auto overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {NAV_AVANCADO.map((grupo) => (
          <React.Fragment key={grupo.label}>
            {grupo.items.map((item) => {
              const ativo = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <AtalhoDeTela key={item.href} href={item.href} rotulo={item.label} ativo={ativo}>
                  <item.icon size={19} aria-hidden className="shrink-0" />
                </AtalhoDeTela>
              );
            })}
            <span aria-hidden="true" className="my-1.5 h-px w-6 shrink-0 self-center bg-border-subtle last:hidden" />
          </React.Fragment>
        ))}
      </nav>

      <AtalhoDeTela href="/settings" rotulo="Configurações" ativo={pathname === "/settings" || pathname.startsWith("/settings/")}>
        <Settings size={19} aria-hidden className="shrink-0" />
      </AtalhoDeTela>
      <ThemeToggle className="size-[42px] rounded-full border-0 bg-transparent hover:bg-hover" />
    </aside>
  );
}
