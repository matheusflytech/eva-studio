"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { usePathname } from "@/lib/contrato/navegacao";
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
      <span aria-hidden="true" className="size-2 rounded-full bg-success" />
      {hora || "--:--"}
    </span>
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
      <Link href="/home" className="flex items-center gap-2.5 justify-self-start" aria-label="Eva, início">
        <span className="grid size-9 place-items-center rounded-[12px] bg-accent-solid text-text-on-accent shadow-[0_8px_20px_-8px_var(--accent-solid)]">
          <MarcaEva size={20} />
        </span>
        <span className="text-body font-semibold tracking-tight text-text-primary">Eva</span>
      </Link>

      <AbasDeLuz itens={ABAS} ativo={ativo} etiqueta={(item) => (item.href === "/conversations" ? rotuloDeNaoLidas(naoLidas) : item.badge)} />

      <div className="flex items-center gap-2 justify-self-end">
        <Relogio />
        <OrgSwitcher avatar />
      </div>
    </header>
  );
}
