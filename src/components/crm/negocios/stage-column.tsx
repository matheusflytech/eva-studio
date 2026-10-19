"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import type { LayoutDoCartao } from "@/lib/cartao-layout";
import { AcoesRapidas, DealCard } from "./deal-card";
import { valorCurto, type EtapaKanban, type NegocioKanban } from "./modelo";

// Cor da etapa em hex: o topo da coluna usa um degradê bem leve dela (classe
// do Tailwind não serve dentro de linear-gradient).
const HEX: Record<string, string> = {
  slate: "#94a3b8",
  blue: "#7aa2f7",
  violet: "#a48bf0",
  amber: "#e3b341",
  emerald: "#3fc58a",
  rose: "#f2555a",
  cyan: "#22d3ee",
};

export function corDaEtapaHex(cor: string, tipo: string): string {
  if (cor && HEX[cor]) return HEX[cor];
  if (tipo === "won") return HEX.emerald;
  if (tipo === "lost") return HEX.rose;
  return HEX.slate;
}

function CartaoArrastavel({
  deal,
  tipoDaEtapa,
  defs,
  layout,
  agora,
  onAbrir,
}: {
  deal: NegocioKanban;
  tipoDaEtapa: string;
  defs: DefinicaoDeCampo[];
  layout: LayoutDoCartao;
  agora: Date;
  onAbrir: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  // Onde o ponteiro desceu: soltar depois de arrastar não pode abrir a prévia.
  const origem = React.useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      {...listeners}
      {...attributes}
      data-deal-id={deal.id}
      aria-label={`${deal.name}. Enter abre a prévia, espaço pega para mover.`}
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
        "group/card relative cursor-grab rounded-[10px] outline-none focus-visible:ring-2 focus-visible:ring-accent-500/70 active:cursor-grabbing",
        isDragging && "opacity-30"
      )}
    >
      <DealCard deal={deal} tipoDaEtapa={tipoDaEtapa} defs={defs} agora={agora} layout={layout} comLink />
      <AcoesRapidas deal={deal} />
    </div>
  );
}

export function StageColumn({
  etapa,
  defs,
  layout,
  agora,
  maiorTotalAberto,
  arrastandoAlgo,
  onAbrir,
  onNovo,
}: {
  etapa: EtapaKanban;
  defs: DefinicaoDeCampo[];
  layout: LayoutDoCartao;
  agora: Date;
  /** Maior total entre as etapas abertas: base da barrinha de proporção. */
  maiorTotalAberto: number;
  arrastandoAlgo: boolean;
  onAbrir: (deal: NegocioKanban) => void;
  onNovo: (stageId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id });
  const cor = corDaEtapaHex(etapa.color, etapa.type);
  const aberta = etapa.type === "open";
  const ganha = etapa.type === "won";

  return (
    <section
      ref={setNodeRef}
      aria-label={`Etapa ${etapa.name}, ${etapa.deals.length} negócios`}
      className={cn(
        "group/col flex max-h-full w-[288px] shrink-0 snap-start flex-col overflow-hidden rounded-xl border bg-surface-1 transition-[border-color,box-shadow] duration-150",
        isOver ? "border-accent-500/60 shadow-[0_0_0_1px_rgba(91,141,239,0.35)]" : "border-border-subtle"
      )}
    >
      <header
        className="px-3 pb-2.5 pt-3"
        style={{ background: `linear-gradient(180deg, ${cor}1a, transparent 92%)` }}
      >
        <div className="flex items-center gap-2">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: cor }} />
          <h2 className="truncate font-display text-[13.5px] font-semibold text-text-primary">{etapa.name}</h2>
          <span className="text-[12px] tabular-nums text-text-tertiary">{etapa.deals.length}</span>
          {aberta && (
            <button
              type="button"
              onClick={() => onNovo(etapa.id)}
              aria-label={`Novo negócio em ${etapa.name}`}
              title={`Novo negócio em ${etapa.name}`}
              className="ml-auto grid h-6 w-6 place-items-center rounded-md text-text-tertiary opacity-0 outline-none transition-opacity hover:bg-surface-3 hover:text-text-primary focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-accent-500/60 group-hover/col:opacity-100"
            >
              <Plus size={14} aria-hidden />
            </button>
          )}
        </div>
        <p className={cn("mt-1.5 font-display text-[18px] font-semibold tracking-[-0.01em] tabular-nums", ganha ? "text-emerald-400" : "text-text-primary")}>
          {valorCurto(etapa.totalCents)}
          {aberta && etapa.totalCents > 0 && (
            <span className="ml-1.5 font-sans text-[11.5px] font-normal tracking-normal text-text-tertiary" title="Valor × chance de fechar">
              {valorCurto(etapa.weightedCents)} previsto
            </span>
          )}
        </p>
        {aberta && (
          <div className="mt-2 h-[2px] overflow-hidden rounded-full bg-border-subtle" aria-hidden>
            <div
              className="h-full rounded-full"
              style={{ width: `${maiorTotalAberto > 0 ? Math.max(2, (etapa.totalCents / maiorTotalAberto) * 100) : 0}%`, background: cor }}
            />
          </div>
        )}
      </header>

      <div className="flex min-h-[110px] flex-1 flex-col gap-1.5 overflow-y-auto px-2 pb-2 pt-1">
        {etapa.deals.map((deal) => (
          <CartaoArrastavel
            key={deal.id}
            deal={deal}
            tipoDaEtapa={etapa.type}
            defs={defs}
            layout={layout}
            agora={agora}
            onAbrir={() => onAbrir(deal)}
          />
        ))}
        {etapa.deals.length === 0 && (
          <div
            className={cn(
              "grid flex-1 place-items-center rounded-[10px] border border-dashed px-3 py-6 text-center text-[12px] transition-colors",
              arrastandoAlgo ? "border-accent-500/50 text-accent-400" : "border-border-default text-text-tertiary"
            )}
          >
            {arrastandoAlgo ? "Solte aqui" : ganha ? "Arraste para cá quando fechar" : aberta ? "Arraste um negócio ou use o +" : "Nada aqui"}
          </div>
        )}
      </div>
    </section>
  );
}
