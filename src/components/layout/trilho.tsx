"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { useSearchParams } from "next/navigation";
import { usePathname } from "@/lib/contrato/navegacao";
import { CalendarCheck, CalendarDays, Contact, Handshake, LayoutGrid, Plus, Search, Settings, Aperture } from "lucide-react";
import { cn } from "@/lib/utils";
import { useBuscaGlobal } from "@/components/busca/paleta-de-busca";
import { ThemeToggle } from "@/components/ui/theme";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { NAV_AVANCADO } from "./navegacao";

const BOTAO = cn(
  "relative grid size-[42px] place-items-center rounded-full text-text-secondary transition-[background-color,color,scale] duration-150",
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
  const naTarefas = pathname === "/tasks" && !naAgenda;
  const emMais = NAV_AVANCADO.some((g) => g.items.some((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)));
  return (
    <aside
      aria-label="Atalhos"
      className={cn("vidro absolute left-3.5 top-1 z-30 flex w-[60px] flex-col items-center gap-1 rounded-[30px] py-2.5", className)}
      style={{ height: "min(calc(100% - 12px), 560px)" }}
      data-print-ocultar
    >
      <Dica texto={`Buscar (${mac ? "⌘K" : "Ctrl+K"})`}>
        <button type="button" onClick={abrir} aria-label="Buscar" aria-keyshortcuts={mac ? "Meta+K" : "Control+K"} className={BOTAO}>
          <Search size={19} aria-hidden />
        </button>
      </Dica>

      <DropdownMenu>
        <Dica texto="Criar">
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Criar" className={BOTAO}>
              <Plus size={19} aria-hidden />
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

      <AtalhoDeTela href="/tasks" rotulo="Meu dia" ativo={naTarefas}>
        <CalendarCheck size={19} aria-hidden />
      </AtalhoDeTela>
      <AtalhoDeTela href="/tasks?tab=calendar" rotulo="Agenda" ativo={naAgenda}>
        <CalendarDays size={19} aria-hidden />
      </AtalhoDeTela>

      <span aria-hidden="true" className="my-2 h-px w-6 bg-border-subtle" />

      <DropdownMenu>
        <Dica texto="Mais ferramentas">
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Mais ferramentas" className={cn(BOTAO, emMais && "bg-hover text-text-primary")}>
              <LayoutGrid size={19} aria-hidden />
            </button>
          </DropdownMenuTrigger>
        </Dica>
        <DropdownMenuContent side="right" align="start" sideOffset={12} className="max-h-[min(70dvh,520px)] w-56 overflow-y-auto">
          {NAV_AVANCADO.map((grupo, i) => (
            <React.Fragment key={grupo.label}>
              {i > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel>{grupo.label}</DropdownMenuLabel>
              {grupo.items.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link href={item.href}>
                    <item.icon size={15} className="shrink-0" /> {item.label}
                  </Link>
                </DropdownMenuItem>
              ))}
            </React.Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <span className="min-h-3 flex-1" />

      <AtalhoDeTela href="/settings" rotulo="Configurações" ativo={pathname === "/settings" || pathname.startsWith("/settings/")}>
        <Settings size={19} aria-hidden />
      </AtalhoDeTela>
      <ThemeToggle className="size-[42px] rounded-full border-0 bg-transparent hover:bg-hover" />
    </aside>
  );
}
