"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { focusRing } from "@/components/ui/styles";
import { cn } from "@/lib/utils";
import { mesmoDia, type Dia } from "@/lib/tarefas/calendario";
import { NOMES_DOS_MESES, chaveDoDia, semanasDoMes, somarMeses, tituloDoDia, type Mes } from "./calendario-dados";

const INICIAIS = ["D", "S", "T", "Q", "Q", "S", "S"] as const;

/**
 * Mini calendário do mês (coluna da esquerda do Calendário): escolher um dia
 * leva a semana e o detalhe para ele. Ponto embaixo do dia = tem algo marcado.
 * Navega pelos meses sozinho, sem mudar o dia escolhido.
 */
export function MiniMes({
  mes,
  onMes,
  escolhido,
  hoje,
  comEventos,
  onEscolher,
}: {
  mes: Mes;
  onMes: (m: Mes) => void;
  escolhido: Dia;
  hoje: Dia;
  /** Chaves (AAAA-MM-DD) dos dias com algo marcado. */
  comEventos: Set<string>;
  onEscolher: (d: Dia) => void;
}) {
  const semanas = React.useMemo(() => semanasDoMes(mes), [mes]);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <IconButton aria-label="Mês anterior" size="sm" onClick={() => onMes(somarMeses(mes, -1))}>
          <ChevronLeft />
        </IconButton>
        <p className="text-small font-semibold text-text-primary" aria-live="polite">
          {NOMES_DOS_MESES[mes.mes - 1]} {mes.ano}
        </p>
        <IconButton aria-label="Próximo mês" size="sm" onClick={() => onMes(somarMeses(mes, 1))}>
          <ChevronRight />
        </IconButton>
      </div>
      <div role="grid" aria-label={`${NOMES_DOS_MESES[mes.mes - 1]} de ${mes.ano}`} className="grid grid-cols-7 gap-y-1 text-center">
        {INICIAIS.map((l, i) => (
          <span key={i} aria-hidden="true" className="pb-1 text-caption font-semibold text-text-primary">
            {l}
          </span>
        ))}
        {semanas.flat().map((d) => {
          const fora = d.mes !== mes.mes;
          const ehEscolhido = mesmoDia(d, escolhido);
          const ehHoje = mesmoDia(d, hoje);
          const tem = comEventos.has(chaveDoDia(d));
          return (
            <button
              key={chaveDoDia(d)}
              type="button"
              onClick={() => onEscolher(d)}
              aria-label={`${tituloDoDia(d)}${ehHoje ? " (hoje)" : ""}${tem ? ", com itens" : ""}`}
              aria-pressed={ehEscolhido}
              className={cn(
                "relative mx-auto grid size-8 place-items-center rounded-full text-small tabular-nums transition-colors duration-150",
                ehEscolhido
                  ? "bg-inverse font-semibold text-inverse-fg"
                  : ehHoje
                    ? "bg-raised font-semibold text-accent-fg hover:bg-hover"
                    : fora
                      ? "text-text-tertiary hover:bg-hover"
                      : "text-text-primary hover:bg-hover",
                focusRing
              )}
            >
              {d.dia}
              {tem && !ehEscolhido && <span aria-hidden="true" className="absolute bottom-0.5 size-1 rounded-full bg-border-strong" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}
