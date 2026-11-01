"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { usePathname } from "@/lib/contrato/navegacao";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { MOLA } from "@/lib/design-system/movimento";
import { useNaoLidas, rotuloDeNaoLidas } from "@/components/inbox/use-nao-lidas";
import { MarcaEva } from "./marca-eva";
import { OrgSwitcher } from "./org-switcher";
import { NAV_PRINCIPAL } from "./navegacao";

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
 * Topo do computador: a marca à esquerda, as abas do dia a dia no centro (a
 * bolha da aba ativa desliza de uma para outra) e, à direita, a hora e a sua
 * conta (menu com seus contratos, configurações, atalhos, ajuda e sair). O que
 * não cabe nas abas fica em "Mais ferramentas", no trilho da esquerda.
 */
export function TopoDaCasca({ className }: { className?: string }) {
  const pathname = usePathname();
  const naoLidas = useNaoLidas();
  return (
    <header className={cn("relative z-20 grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3 px-5 pb-1 pt-3", className)} data-print-ocultar>
      <Link href="/home" className="flex items-center gap-2.5 justify-self-start" aria-label="Eva, início">
        <span className="grid size-9 place-items-center rounded-[12px] bg-accent-solid text-text-on-accent shadow-[0_8px_20px_-8px_var(--accent-solid)]">
          <MarcaEva size={20} />
        </span>
        <span className="text-body font-semibold tracking-tight text-text-primary">Eva</span>
      </Link>

      <nav aria-label="Seções" className="vidro relative flex items-center gap-0.5 rounded-full p-1">
        {NAV_PRINCIPAL[0].items.map((item) => {
          const ativo = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const badge = item.href === "/conversations" ? rotuloDeNaoLidas(naoLidas) : item.badge;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={ativo ? "page" : undefined}
              className={cn(
                "relative z-10 flex h-9 items-center gap-1.5 rounded-full px-3.5 text-small font-medium transition-colors duration-150",
                ativo ? "text-text-on-accent" : "text-text-secondary hover:text-text-primary"
              )}
            >
              {ativo && (
                <motion.span
                  layoutId="aba-ativa"
                  className="absolute inset-0 -z-10 rounded-full bg-accent-solid shadow-[0_6px_18px_-6px_var(--accent-solid)]"
                  transition={MOLA}
                />
              )}
              <span>{item.label}</span>
              {badge && (
                <span className={cn("rounded-full px-1.5 font-mono text-caption font-medium leading-[18px]", ativo ? "bg-white/25 text-text-on-accent" : "bg-accent-solid text-text-on-accent")}>
                  {badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2 justify-self-end">
        <Relogio />
        <OrgSwitcher avatar />
      </div>
    </header>
  );
}
