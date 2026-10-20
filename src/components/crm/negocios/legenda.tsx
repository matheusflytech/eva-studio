"use client";

import * as React from "react";
import { CircleHelp, Clock, MessageCircle } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";

function Linha({ exemplo, children }: { exemplo: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 py-1.5">
      <span className="grid w-20 shrink-0 place-items-center">{exemplo}</span>
      <span className="text-small text-text-secondary">{children}</span>
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
        <IconButton aria-label="Como ler o quadro" tooltip>
          <CircleHelp />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-3">
        <DropdownMenuLabel>Como ler o quadro</DropdownMenuLabel>
        <ul className="divide-y divide-border-subtle">
          <Linha exemplo={<span className="text-caption tabular-nums text-text-tertiary">60%</span>}>
            Chance de fechar. Vem da etapa e pode ser ajustada no negócio.
          </Linha>
          <Linha
            exemplo={
              <Badge variant="danger">
                <Clock size={12} aria-hidden="true" /> Atrasado
              </Badge>
            }
          >
            O próximo passo. Vermelho: retorno ou fechamento atrasado. Amarelo: parado há mais de 7 dias. Verde: reunião marcada ou ganho. Cinza: em
            dia.
          </Linha>
          <Linha exemplo={<span className="text-caption text-text-tertiary">3 dias</span>}>
            Há quanto tempo o negócio está na etapa (minutos, horas ou dias).
          </Linha>
          <Linha exemplo={<MessageCircle size={16} aria-hidden="true" className="text-success" />}>
            Conversa no WhatsApp. O ponto indica mensagem do cliente ainda não lida.
          </Linha>
          <Linha exemplo={<span className="text-caption text-text-tertiary">arrastar</span>}>
            Arraste o cartão para mudar de etapa. Ao arrastar, aparecem as áreas Ganho e Perdido no rodapé.
          </Linha>
          <Linha exemplo={<kbd className="rounded-sm border border-border-default px-1.5 text-caption text-text-secondary">N</kbd>}>
            Atalhos: N cria negócio, / busca, espaço pega e solta o cartão pelo teclado.
          </Linha>
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
