"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { Bell, Check, Mail } from "lucide-react";
import { usePathname } from "@/lib/contrato/navegacao";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useNaoLidas, rotuloDeNaoLidas } from "@/components/inbox/use-nao-lidas";
import { MarcaEva } from "./marca-eva";
import { OrgSwitcher } from "./org-switcher";
import { NAV_PRINCIPAL } from "./navegacao";
import { AbasDeLuz } from "./abas-de-luz";

const ABAS = NAV_PRINCIPAL[0].items;

/** Hora local, de 15 em 15 s. Começa vazia: o servidor e o navegador não discordam da hora. */
function Relogio() {
  const [hora, setHora] = React.useState("");
  React.useEffect(() => {
    const pinta = () => setHora(new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    pinta();
    const t = setInterval(pinta, 15_000);
    return () => clearInterval(t);
  }, []);
  return (
    <span
      className="vidro relative hidden h-9 items-center gap-2 rounded-full px-3.5 font-mono text-small tabular-nums text-text-secondary xl:inline-flex"
      title="Hora do seu computador"
    >
      {hora || "--:--"}
    </span>
  );
}

const BOTAO_REDONDO = "vidro relative grid size-9 place-items-center rounded-full text-text-secondary transition-[color,scale] duration-150 hover:text-text-primary active:scale-[0.92] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

interface Pendencia { id: string; tipo: "urgente" | "atencao" | "config"; titulo: string; detalhe: string; href: string; quantidade?: number }

/** Sino: o que pede você agora (as mesmas pendências do Início), buscado ao abrir. */
function Sino() {
  const [itens, setItens] = React.useState<Pendencia[] | null>(null);
  const carregar = (aberto: boolean) => {
    if (!aberto) return;
    fetch("/api/inicio")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d: { pendencias?: Pendencia[] }) => setItens((d.pendencias ?? []).filter((p) => p.tipo !== "config")))
      .catch(() => setItens([]));
  };
  return (
    <DropdownMenu onOpenChange={carregar}>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Notificações" title="Notificações" className={BOTAO_REDONDO}>
          <Bell size={17} aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={10} className="w-80">
        <DropdownMenuLabel>O que pede você agora</DropdownMenuLabel>
        {itens === null ? (
          <p className="px-3 py-2 text-small text-text-tertiary">Carregando…</p>
        ) : itens.length === 0 ? (
          <p className="flex items-center gap-2 px-3 py-2 text-small text-text-secondary">
            <Check size={14} className="text-success" aria-hidden /> Nada pedindo você agora.
          </p>
        ) : (
          itens.map((p) => (
            <DropdownMenuItem key={p.id} asChild>
              <Link href={p.href} className="flex flex-col items-start gap-0.5">
                <span className="text-small font-medium text-text-primary">{p.titulo}</span>
                <span className="line-clamp-2 text-caption text-text-secondary">{p.detalhe}</span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * Topo do computador: a marca à esquerda, as abas do dia a dia no centro (uma
 * luz de cor própria cerca a aba ativa e se estica até a nova ao trocar) e, à
 * direita, a hora e a sua conta (menu com seus contratos, configurações,
 * atalhos, ajuda e sair). O que não cabe nas abas fica em "Mais ferramentas",
 * no trilho da esquerda.
 */
export function TopoDaCasca({ className }: { className?: string }) {
  const pathname = usePathname();
  const naoLidas = useNaoLidas();
  const ativo = ABAS.findIndex((a) => pathname === a.href || pathname.startsWith(`${a.href}/`));
  return (
    <header className={cn("relative z-20 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 pb-3 pt-3", className)} data-print-ocultar>
      {/* Só a marca, no mesmo eixo do trilho (60px de largura, 14px da borda; o topo tem 20px de padding). */}
      <Link href="/home" className="-ml-1.5 flex w-[60px] items-center justify-center justify-self-start" aria-label="Eva, início">
        <MarcaEva size={28} title="Eva" className="text-text-primary" />
      </Link>

      <AbasDeLuz itens={ABAS} ativo={ativo} etiqueta={(item) => (item.href === "/conversations" ? rotuloDeNaoLidas(naoLidas) : item.badge)} />

      <div className="flex items-center gap-2 justify-self-end">
        <Relogio />
        <Link href="/conversations" aria-label="Caixa de entrada" title="Caixa de entrada" className={BOTAO_REDONDO}>
          <Mail size={17} aria-hidden />
          {naoLidas > 0 && <span aria-hidden="true" className="absolute right-1.5 top-1.5 size-2 rounded-full bg-danger" />}
        </Link>
        <Sino />
        <OrgSwitcher avatar />
      </div>
    </header>
  );
}
