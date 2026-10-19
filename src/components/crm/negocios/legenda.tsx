"use client";

import * as React from "react";
import { CircleHelp, Clock, MessageCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

function Linha({ exemplo, children }: { exemplo: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      <span className="grid w-[74px] shrink-0 place-items-center">{exemplo}</span>
      <span className="text-[12.5px] leading-snug text-text-secondary">{children}</span>
    </li>
  );
}

/**
 * "Como ler o quadro": explica cada marca do cartão com uma miniatura dela.
 * Quem abre o CRM pela primeira vez entende o quadro sem treinamento.
 */
export function LegendaDoQuadro() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Como ler o quadro"
          className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] text-text-tertiary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60"
        >
          <CircleHelp size={14} aria-hidden />
          <span className="hidden sm:inline">Como ler</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] p-3">
        <p className="mb-1 text-[12px] font-medium uppercase tracking-[0.06em] text-text-tertiary">Como ler o quadro</p>
        <ul className="divide-y divide-border-subtle">
          <Linha
            exemplo={
              <span className="inline-flex items-center gap-1.5">
                <span className="h-[3px] w-[34px] overflow-hidden rounded-full bg-surface-3">
                  <span className="block h-full w-[60%] rounded-full bg-accent-500" />
                </span>
                <span className="text-[11px] tabular-nums text-text-tertiary">60%</span>
              </span>
            }
          >
            Chance de fechar. Vem da etapa e pode ser ajustada no negócio.
          </Linha>
          <Linha exemplo={<span className="h-7 w-[60px] rounded-md border border-amber-400/60 bg-surface-2" />}>
            Borda amarela: precisa de atenção. Está parado há 7 dias ou mais, ou tem retorno atrasado.
          </Linha>
          <Linha
            exemplo={
              <span className="inline-flex items-center gap-1 rounded-md bg-danger/12 px-[7px] py-0.5 text-[11px] text-danger">
                <Clock size={11} aria-hidden /> Atrasado
              </span>
            }
          >
            O próximo passo. Vermelho: retorno ou fechamento atrasado. Amarelo: parado. Verde: reunião marcada ou ganho. Cinza: em dia.
          </Linha>
          <Linha
            exemplo={
              <span className="relative inline-flex text-[#25d366]">
                <MessageCircle size={16} aria-hidden />
                <span className="absolute -right-0.5 -top-0.5 h-[7px] w-[7px] rounded-full border-2 border-surface-3 bg-[#25d366]" />
              </span>
            }
          >
            Conversa no WhatsApp. O ponto verde indica mensagem do cliente ainda não lida.
          </Linha>
          <Linha exemplo={<span className="text-[11px] text-text-tertiary">arrastar</span>}>
            Arraste o cartão para mudar de etapa. Ao arrastar, aparecem as áreas <b className="text-emerald-400">Ganho</b> e{" "}
            <b className="text-danger">Perdido</b> no rodapé.
          </Linha>
          <Linha exemplo={<kbd className="rounded border border-border-default px-1.5 text-[11px] text-text-secondary">N</kbd>}>
            Atalhos: <b className="text-text-primary">N</b> cria negócio, <b className="text-text-primary">/</b> busca, espaço pega e solta o
            cartão pelo teclado.
          </Linha>
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
