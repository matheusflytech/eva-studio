"use client";

import * as React from "react";
import { CircleCheck, Flag, RotateCcw } from "lucide-react";
import Link from "@/components/contrato/link";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import { textoDoPrazo } from "@/lib/tarefas/formato";
import { ROTULO_DO_RESULTADO } from "@/lib/tarefas/tipos";
import type { TarefaDaTela } from "@/lib/tarefas/tela";
import { AcaoRapida, IconeDoTipo, RotuloDaOrigem } from "./pecas";
import { MenuDeAdiar } from "./adiar";

// Linha de tarefa: seleção (ações em massa), concluir (abre o diálogo de
// conclusão), tipo, texto, vínculos, prazo, ação de 1 clique e adiar.

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
  onConcluir: (t: TarefaDaTela) => void;
  onReabrir?: (t: TarefaDaTela) => void;
  onMudou: () => void;
}) {
  const feita = !!tarefa.doneAt;
  return (
    <li className={cn("group flex min-h-11 items-start gap-3 border-b border-border-subtle px-3 py-2 last:border-b-0 hover:bg-hover/60", selecionada && "bg-accent-subtle/50")}>
      {onSelecionar && (
        <Checkbox
          checked={!!selecionada}
          onCheckedChange={(v) => onSelecionar(v === true)}
          aria-label={`Selecionar: ${tarefa.text}`}
          className="mt-1"
        />
      )}
      {feita ? (
        <IconButton aria-label={`Reabrir: ${tarefa.text}`} tooltip="Reabrir" size="sm" onClick={() => onReabrir?.(tarefa)} disabled={!onReabrir}>
          <RotateCcw />
        </IconButton>
      ) : (
        <IconButton aria-label={`Concluir: ${tarefa.text}`} tooltip="Concluir" size="sm" onClick={() => onConcluir(tarefa)}>
          <CircleCheck />
        </IconButton>
      )}
      <IconeDoTipo tipo={tarefa.type} className="mt-1.5" />
      <div className="min-w-0 flex-1">
        <p className={cn("text-body text-text-primary", feita && "text-text-tertiary line-through")}>{tarefa.text}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-tertiary">
          {tarefa.deal && (
            <Link href={`/negocios/${tarefa.deal.id}`} className="truncate hover:text-accent-fg hover:underline">
              {tarefa.deal.name}
            </Link>
          )}
          {tarefa.contact && (
            <Link href={`/contatos?abrir=${tarefa.contact.id}`} className="truncate hover:text-accent-fg hover:underline">
              {tarefa.contact.name || tarefa.contact.phone}
            </Link>
          )}
          {tarefa.assignedTo && <span>· {tarefa.assignedTo.name}</span>}
          {tarefa.prioridade === "alta" && (
            <Badge variant="warning">
              <Flag size={12} aria-hidden /> Alta
            </Badge>
          )}
          <RotuloDaOrigem origem={tarefa.origem} />
          {tarefa.adiada >= 2 && !feita && <span title="Quantas vezes foi adiada">adiada {tarefa.adiada}x</span>}
          {feita && tarefa.resultado && <Badge variant="neutral">{ROTULO_DO_RESULTADO[tarefa.resultado]}</Badge>}
          {feita && tarefa.decisao === "sem_proximo" && <span>sem próximo passo</span>}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <span className={cn("text-small tabular-nums", tarefa.overdue ? "font-medium text-danger" : "text-text-secondary")}>
          {feita ? `Feita ${textoDoPrazo(tarefa.doneAt, false, agora).toLowerCase()}` : textoDoPrazo(tarefa.dueAt, tarefa.diaTodo, agora)}
          {tarefa.overdue && <span className="sr-only"> (atrasada)</span>}
        </span>
        {!feita && (
          <>
            <AcaoRapida tipo={tarefa.type} contato={tarefa.contact ? { telefone: tarefa.contact.phone, email: tarefa.contact.email, conversaId: tarefa.conversaId } : null} />
            <MenuDeAdiar tarefa={tarefa} onAdiada={onMudou} />
          </>
        )}
      </div>
    </li>
  );
}
