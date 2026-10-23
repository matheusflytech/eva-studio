"use client";

import * as React from "react";
import { focusRing } from "@/components/ui/styles";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import { cn } from "@/lib/utils";
import { mesmoDia, type Dia } from "@/lib/tarefas/calendario";
import { chaveDoDia, horaDoEvento, resumirDia, semanasDoMes, textoDoResumo, tituloDoDia, type EventoDoCalendario } from "./calendario-dados";
import { corDoEvento } from "./semana";

// Grade do mês (visão Mês do Calendário), no mesmo desenho da semana: cada
// dia é uma célula com os itens em cartões de cor do tipo; clicar no dia ou
// num item leva o detalhe da esquerda para ele (sem gaveta por cima).

const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;
/** Itens mostrados na célula antes do "+N". */
const NA_CELULA = 3;

const primeiraMaiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function GradeDoMes({
  dia,
  porDia,
  hoje,
  selecionadoId,
  onEscolherDia,
  onEscolherEvento,
}: {
  /** Dia escolhido: define o mês e fica em destaque. */
  dia: Dia;
  porDia: Map<string, EventoDoCalendario[]>;
  hoje: Dia;
  selecionadoId: string | null;
  onEscolherDia: (d: Dia) => void;
  onEscolherEvento: (e: EventoDoCalendario) => void;
}) {
  const semanas = React.useMemo(() => semanasDoMes({ ano: dia.ano, mes: dia.mes }), [dia.ano, dia.mes]);
  return (
    <div className="flex h-[max(520px,calc(100dvh-300px))] flex-col">
      <div className="grid grid-cols-7 border-b border-border-subtle" aria-hidden="true">
        {DIAS.map((d) => (
          <span key={d} className="border-l border-border-subtle py-2.5 text-center text-small text-text-secondary first:border-l-0">
            {d}
          </span>
        ))}
      </div>
      <div role="grid" aria-label="Dias do mês" className="grid min-h-0 flex-1 grid-cols-7" style={{ gridTemplateRows: `repeat(${semanas.length}, minmax(0, 1fr))` }}>
        {semanas.flat().map((d) => (
          <CelulaDoDia
            key={chaveDoDia(d)}
            dia={d}
            eventos={porDia.get(chaveDoDia(d)) ?? []}
            foraDoMes={d.mes !== dia.mes}
            ehHoje={mesmoDia(d, hoje)}
            escolhido={mesmoDia(d, dia)}
            selecionadoId={selecionadoId}
            onEscolherDia={onEscolherDia}
            onEscolherEvento={onEscolherEvento}
          />
        ))}
      </div>
    </div>
  );
}

function CelulaDoDia({
  dia,
  eventos,
  foraDoMes,
  ehHoje,
  escolhido,
  selecionadoId,
  onEscolherDia,
  onEscolherEvento,
}: {
  dia: Dia;
  eventos: EventoDoCalendario[];
  foraDoMes: boolean;
  ehHoje: boolean;
  escolhido: boolean;
  selecionadoId: string | null;
  onEscolherDia: (d: Dia) => void;
  onEscolherEvento: (e: EventoDoCalendario) => void;
}) {
  const resumo = resumirDia(eventos);
  const visiveis = eventos.slice(0, NA_CELULA);
  const resto = eventos.length - visiveis.length;
  return (
    <div
      role="gridcell"
      aria-selected={escolhido}
      onClick={() => onEscolherDia(dia)}
      className={cn(
        "group/celula relative flex min-h-0 min-w-0 cursor-pointer flex-col gap-1 overflow-hidden border-b border-l border-border-subtle p-1.5 transition-colors duration-150 [&:nth-child(7n+1)]:border-l-0",
        escolhido ? "bg-raised" : "hover:bg-raised/60",
        foraDoMes && "bg-canvas/40"
      )}
    >
      <button
        type="button"
        onClick={(ev) => {
          ev.stopPropagation();
          onEscolherDia(dia);
        }}
        aria-label={`${primeiraMaiuscula(tituloDoDia(dia))}${ehHoje ? " (hoje)" : ""}: ${textoDoResumo(resumo)}`}
        className={cn(
          "flex items-center gap-1.5 self-start rounded-full pr-1.5",
          focusRing
        )}
      >
        <span
          className={cn(
            "grid size-7 place-items-center rounded-full text-small tabular-nums",
            ehHoje ? "bg-accent-solid font-semibold text-text-on-accent" : escolhido ? "bg-inverse font-semibold text-inverse-fg" : foraDoMes ? "text-text-tertiary" : "font-medium text-text-primary"
          )}
        >
          {dia.dia}
        </span>
        {resumo.atrasadas > 0 && <span className="font-mono text-caption text-danger">{resumo.atrasadas} atras.</span>}
      </button>

      {visiveis.map((e) => {
        const cor = CATEGORY_CLASSES[corDoEvento(e)];
        return (
          <button
            key={e.id}
            type="button"
            onClick={(ev) => {
              ev.stopPropagation();
              onEscolherEvento(e);
            }}
            aria-pressed={e.id === selecionadoId}
            aria-label={`${e.titulo}${e.diaTodo ? "" : `, ${horaDoEvento(e)}`}${e.atrasada ? ", atrasada" : ""}`}
            title={e.titulo}
            className={cn(
              "relative flex min-w-0 items-center gap-1.5 rounded-[8px] border py-0.5 pl-2.5 pr-1.5 text-left transition-[border-color,box-shadow] duration-150 hover:shadow-overlay",
              cor.subtle,
              e.id === selecionadoId ? "border-text-primary" : "border-transparent",
              e.feita && "opacity-55",
              focusRing
            )}
          >
            <span aria-hidden="true" className={cn("absolute inset-y-1 left-1 w-[2px] rounded-full", cor.solid)} />
            {!e.diaTodo && <span className={cn("shrink-0 font-mono text-[11px] tabular-nums", cor.fg)}>{horaDoEvento(e)}</span>}
            <span className={cn("truncate text-caption font-medium", e.feita ? "text-text-tertiary line-through" : "text-text-primary")}>{e.titulo}</span>
          </button>
        );
      })}
      {resto > 0 && (
        <button
          type="button"
          onClick={(ev) => {
            ev.stopPropagation();
            onEscolherDia(dia);
          }}
          className={cn("self-start rounded-md px-1 text-caption font-medium text-text-secondary hover:text-text-primary", focusRing)}
        >
          +{resto} {resto === 1 ? "item" : "itens"}
        </button>
      )}
    </div>
  );
}
