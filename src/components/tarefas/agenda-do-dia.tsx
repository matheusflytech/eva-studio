"use client";

import * as React from "react";
import { focusRing } from "@/components/ui/styles";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import { cn } from "@/lib/utils";
import type { Dia } from "@/lib/tarefas/calendario";
import { horaDoEvento, resumirDia, textoDoResumo, tituloDoDia, type EventoDoCalendario } from "./calendario-dados";
import { corDoEvento } from "./semana";

const primeiraMaiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Agenda do dia escolhido (coluna da esquerda do Calendário): tudo do dia em
 * linhas curtas, na ordem do relógio; clicar leva o detalhe para o item.
 */
export function AgendaDoDia({
  dia,
  eventos,
  selecionadoId,
  onEscolher,
}: {
  dia: Dia;
  eventos: EventoDoCalendario[];
  selecionadoId: string | null;
  onEscolher: (e: EventoDoCalendario) => void;
}) {
  return (
    <section aria-label="Agenda do dia" className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-small font-semibold text-text-primary">{primeiraMaiuscula(tituloDoDia(dia))}</p>
        <p className="shrink-0 font-mono text-caption text-text-tertiary">{eventos.length ? textoDoResumo(resumirDia(eventos)) : ""}</p>
      </div>
      {eventos.length === 0 ? (
        <p className="rounded-[12px] border border-dashed border-border-default px-3 py-4 text-center text-small text-text-tertiary">Nada marcado para este dia.</p>
      ) : (
        <ul className="flex max-h-[220px] flex-col gap-0.5 overflow-y-auto">
          {eventos.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => onEscolher(e)}
                aria-pressed={e.id === selecionadoId}
                className={cn(
                  "flex w-full min-w-0 items-center gap-2 rounded-[10px] px-2 py-1.5 text-left transition-colors duration-150",
                  e.id === selecionadoId ? "bg-raised" : "hover:bg-raised/70",
                  focusRing
                )}
              >
                <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", CATEGORY_CLASSES[corDoEvento(e)].solid)} />
                <span className="w-11 shrink-0 font-mono text-caption tabular-nums text-text-tertiary">{e.origem === "negocio" ? "prev." : e.diaTodo ? "dia" : horaDoEvento(e)}</span>
                <span className={cn("min-w-0 flex-1 truncate text-small", e.feita ? "text-text-tertiary line-through" : e.atrasada ? "text-danger" : "text-text-primary")}>{e.titulo}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
