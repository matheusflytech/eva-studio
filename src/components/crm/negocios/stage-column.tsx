"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { corDaEtapa, type DefinicaoDeCampo } from "@/lib/custom-fields";
import { DealCard } from "./deal-card";
import { valorCurto, type EtapaKanban, type NegocioKanban } from "./modelo";

function CartaoArrastavel({
  deal,
  tipoDaEtapa,
  defs,
  agora,
  onAbrir,
}: {
  deal: NegocioKanban;
  tipoDaEtapa: string;
  defs: DefinicaoDeCampo[];
  agora: Date;
  onAbrir: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  // Onde o ponteiro desceu: soltar depois de arrastar não pode abrir o painel.
  const origem = React.useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      aria-label={`${deal.name}. Enter abre, espaço pega para mover.`}
      onPointerDownCapture={(e) => {
        origem.current = { x: e.clientX, y: e.clientY };
      }}
      onClick={(e) => {
        const p = origem.current;
        if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) return;
        onAbrir();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onAbrir();
          return;
        }
        listeners?.onKeyDown?.(e);
      }}
      className={cn(
        "cursor-grab rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 active:cursor-grabbing",
        isDragging && "opacity-30"
      )}
    >
      <DealCard deal={deal} tipoDaEtapa={tipoDaEtapa} defs={defs} agora={agora} />
    </div>
  );
}

export function StageColumn({
  etapa,
  defs,
  agora,
  maiorTotalAberto,
  arrastandoAlgo,
  onAbrir,
  onNovo,
}: {
  etapa: EtapaKanban;
  defs: DefinicaoDeCampo[];
  agora: Date;
  /** Maior total entre as etapas abertas: base da barrinha de proporção. */
  maiorTotalAberto: number;
  arrastandoAlgo: boolean;
  onAbrir: (deal: NegocioKanban) => void;
  onNovo: (stageId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id });
  const cor = corDaEtapa(etapa.color, etapa.type);
  const aberta = etapa.type === "open";

  return (
    <section
      ref={setNodeRef}
      aria-label={`Etapa ${etapa.name}, ${etapa.deals.length} negócios`}
      className={cn(
        "flex max-h-full w-[292px] shrink-0 snap-start flex-col rounded-2xl bg-surface-1/70 ring-1 transition-[box-shadow,background-color] duration-150",
        isOver ? "bg-accent-soft/40 ring-2 ring-accent-500/60" : "ring-border-subtle"
      )}
    >
      <header className="relative px-3.5 pb-3 pt-3.5">
        <span aria-hidden className={cn("absolute inset-x-3.5 top-0 h-[3px] rounded-b-full", cor.ponto)} />
        <div className="flex items-center gap-2">
          <h2 className="truncate text-[13.5px] font-semibold text-text-primary">{etapa.name}</h2>
          <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] font-medium tabular-nums text-text-secondary">
            {etapa.deals.length}
          </span>
          {aberta && (
            <button
              type="button"
              onClick={() => onNovo(etapa.id)}
              aria-label={`Novo negócio em ${etapa.name}`}
              title={`Novo negócio em ${etapa.name}`}
              className="ml-auto grid h-7 w-7 place-items-center rounded-lg text-text-tertiary outline-none transition-colors hover:bg-surface-3 hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60"
            >
              <Plus size={15} aria-hidden />
            </button>
          )}
        </div>
        <div className="mt-2 flex items-baseline justify-between gap-2">
          <span className="font-display text-[15px] font-semibold tabular-nums text-text-primary">{valorCurto(etapa.totalCents)}</span>
          {aberta && etapa.totalCents > 0 && (
            <span className="text-[11px] tabular-nums text-text-tertiary" title="Valor × chance de fechar">
              {valorCurto(etapa.weightedCents)} previsto
            </span>
          )}
        </div>
        {aberta && maiorTotalAberto > 0 && (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
            <div
              className={cn("h-full rounded-full opacity-80", cor.ponto)}
              style={{ width: `${Math.max(2, (etapa.totalCents / maiorTotalAberto) * 100)}%` }}
            />
          </div>
        )}
      </header>

      <div className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto px-2.5 pb-2.5">
        {etapa.deals.map((deal) => (
          <CartaoArrastavel
            key={deal.id}
            deal={deal}
            tipoDaEtapa={etapa.type}
            defs={defs}
            agora={agora}
            onAbrir={() => onAbrir(deal)}
          />
        ))}
        {etapa.deals.length === 0 && (
          <div
            className={cn(
              "grid flex-1 place-items-center rounded-xl border border-dashed px-3 py-8 text-center text-[12px] transition-colors",
              arrastandoAlgo ? "border-accent-500/50 text-accent-400" : "border-border-default text-text-tertiary"
            )}
          >
            {arrastandoAlgo ? "Solte aqui" : aberta ? "Nenhum negócio nesta etapa" : "Nada aqui ainda"}
          </div>
        )}
      </div>
    </section>
  );
}
