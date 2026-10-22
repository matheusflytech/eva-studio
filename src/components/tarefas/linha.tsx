"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import Link from "@/components/contrato/link";
import { Checkbox } from "@/components/ui/checkbox";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import { textoDeMinutos, textoDoPrazo } from "@/lib/tarefas/formato";
import { ROTULO_DO_RESULTADO, rotuloDoTipo } from "@/lib/tarefas/tipos";
import type { TarefaDaTela } from "@/lib/tarefas/tela";
import { AcaoRapida, BotaoConcluir, RotuloDaOrigem, acoesDaLinha, linhaDeLista } from "./pecas";
import { MenuDeAdiar } from "./adiar";

// Linha de tarefa: seleção (ações em massa, aparece ao passar o mouse),
// concluir (abre o diálogo de conclusão), o que é e para quem, e o prazo.
// Ligar/e-mail e adiar aparecem ao passar o mouse; duração e origem ficam no
// título da linha.

export function LinhaDeTarefa({
  tarefa,
  agora,
  selecionada,
  onSelecionar,
  onConcluir,
  onReabrir,
  onMudou,
}: {
  tarefa: TarefaDaTela;
  agora: Date;
  selecionada?: boolean;
  onSelecionar?: (v: boolean) => void;
  /** el: o círculo clicado (de onde o fundo pulsa quando a conclusão termina). */
  onConcluir: (t: TarefaDaTela, el?: HTMLElement) => void;
  onReabrir?: (t: TarefaDaTela) => void;
  onMudou: () => void;
}) {
  const feita = !!tarefa.doneAt;
  const detalhes = [
    `Leva ${textoDeMinutos(tarefa.duracaoMin)}`,
    tarefa.adiada >= 2 && !feita ? `adiada ${tarefa.adiada}x` : null,
    tarefa.origem === "automacao" ? "criada por automação" : tarefa.origem === "ia" ? "criada pela IA" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <li className={cn(linhaDeLista, selecionada && "bg-accent-subtle hover:bg-accent-subtle")} title={detalhes}>
      {onSelecionar && (
        <Checkbox
          checked={!!selecionada}
          onCheckedChange={(v) => onSelecionar(v === true)}
          aria-label={`Selecionar: ${tarefa.text}`}
          className="opacity-0 transition-opacity group-hover/linha:opacity-100 focus-visible:opacity-100 data-[state=checked]:opacity-100 [@media(hover:none)]:opacity-100"
        />
      )}
      {feita ? (
        <IconButton aria-label={`Reabrir: ${tarefa.text}`} tooltip="Reabrir" size="sm" onClick={() => onReabrir?.(tarefa)} disabled={!onReabrir}>
          <RotateCcw />
        </IconButton>
      ) : (
        <BotaoConcluir
          texto={tarefa.text}
          onConcluir={(el) => onConcluir(tarefa, el)}
        />
      )}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <RotuloDaOrigem origem={tarefa.origem} />
          <span className={cn("truncate text-body font-medium text-text-primary", feita && "font-normal text-text-tertiary line-through")}>{tarefa.text}</span>
        </span>
        <span className="flex min-w-0 items-center gap-1 truncate text-caption text-text-tertiary">
          {/* No celular o prazo desce para cá e o título fica com a largura toda. */}
          <span className={cn("shrink-0 sm:hidden", tarefa.overdue ? "font-medium text-danger" : "text-text-secondary")}>
            {feita ? `Feita ${textoDoPrazo(tarefa.doneAt, false, agora).toLowerCase()}` : textoDoPrazo(tarefa.dueAt, tarefa.diaTodo, agora)} ·
          </span>
          <span className="shrink-0">{rotuloDoTipo(tarefa.type)}</span>
          {tarefa.deal && (
            <>
              <span aria-hidden="true">·</span>
              <Link href={`/negocios/${tarefa.deal.id}`} className="truncate hover:text-accent-fg hover:underline">
                {tarefa.deal.name}
              </Link>
            </>
          )}
          {tarefa.contact && (
            <>
              <span aria-hidden="true">·</span>
              <Link href={`/contatos?abrir=${tarefa.contact.id}`} className="truncate hover:text-accent-fg hover:underline">
                {tarefa.contact.name || tarefa.contact.phone}
              </Link>
            </>
          )}
          {tarefa.assignedTo && <span className="shrink-0">· {tarefa.assignedTo.name}</span>}
          {tarefa.prioridade === "alta" && !feita && <span className="shrink-0 text-warning">· alta</span>}
          {feita && tarefa.resultado && <span className="shrink-0">· {ROTULO_DO_RESULTADO[tarefa.resultado]}</span>}
          {feita && tarefa.decisao === "sem_proximo" && <span className="shrink-0">· sem próximo passo</span>}
        </span>
      </span>
      {!feita && (
        <span className={acoesDaLinha}>
          <AcaoRapida tipo={tarefa.type} contato={tarefa.contact ? { telefone: tarefa.contact.phone, email: tarefa.contact.email, conversaId: tarefa.conversaId } : null} />
          <MenuDeAdiar tarefa={tarefa} onAdiada={onMudou} />
        </span>
      )}
      <span className={cn("hidden shrink-0 text-small tabular-nums sm:inline", tarefa.overdue ? "font-medium text-danger" : "text-text-secondary")}>
        {feita ? `Feita ${textoDoPrazo(tarefa.doneAt, false, agora).toLowerCase()}` : textoDoPrazo(tarefa.dueAt, tarefa.diaTodo, agora)}
        {tarefa.overdue && <span className="sr-only"> (atrasada)</span>}
      </span>
    </li>
  );
}
