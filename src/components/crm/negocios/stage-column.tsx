"use client";

import * as React from "react";
import { CircleHelp, Loader2, Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { KanbanColumn } from "@/components/ui/kanban-column";
import { IconButton } from "@/components/ui/icon-button";
import { Button } from "@/components/ui/button";
import { focusRing } from "@/components/ui/styles";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import type { LayoutDoCartao } from "@/lib/cartao-layout";
import { AcoesRapidas, DealCard } from "./deal-card";
import type { EtapaKanban, NegocioKanban } from "./modelo";
import { VozDoQuadro } from "./eva-topo";
import { vazioDaEtapa } from "./eva-voz";

function CartaoArrastavel({
  deal,
  tipoDaEtapa,
  defs,
  layout,
  agora,
  onAbrir,
  prazoParado,
}: {
  deal: NegocioKanban;
  tipoDaEtapa: string;
  defs: DefinicaoDeCampo[];
  layout: LayoutDoCartao;
  agora: Date;
  onAbrir: () => void;
  prazoParado?: number | null;
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
      className={cn("group/card relative cursor-grab rounded-md active:cursor-grabbing", focusRing, isDragging && "opacity-30")}
    >
      <DealCard deal={deal} tipoDaEtapa={tipoDaEtapa} defs={defs} agora={agora} layout={layout} prazoParado={prazoParado} comLink />
      <AcoesRapidas deal={deal} />
    </div>
  );
}

/**
 * "O que fazer nesta etapa" (regra da etapa): ícone de ajuda no cabeçalho da
 * coluna com o texto no tooltip. O texto também aparece na ficha, então o
 * tooltip não é o único lugar da informação.
 */
export function OrientacaoDaEtapa({ etapa, texto }: { etapa: string; texto: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={`O que fazer em ${etapa}: ${texto}`}
          className={cn("inline-flex size-7 items-center justify-center rounded-md text-text-tertiary hover:bg-hover hover:text-text-primary", focusRing)}
        >
          <CircleHelp size={14} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="whitespace-pre-line">{texto}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Coluna do quadro: casca do design system (KanbanColumn) com o alvo de
 * soltar do dnd-kit, cabeçalho simples (nome, contagem, +, recolher),
 * rodapé com Total e Ponderado agregados no servidor e "Carregar mais"
 * automático ao rolar até o fim da coluna (com botão, para teclado).
 */
export function StageColumn({
  etapa,
  defs,
  layout,
  agora,
  arrastandoAlgo,
  recolhida,
  carregandoMais,
  onRecolher,
  onCarregarMais,
  onAbrir,
  onNovo,
  etapaAnterior = null,
}: {
  etapa: EtapaKanban;
  /** Nome da etapa aberta antes desta, para o texto da coluna vazia. */
  etapaAnterior?: string | null;
  defs: DefinicaoDeCampo[];
  layout: LayoutDoCartao;
  agora: Date;
  arrastandoAlgo: boolean;
  recolhida: boolean;
  carregandoMais: boolean;
  onRecolher: (recolher: boolean) => void;
  onCarregarMais: () => void;
  onAbrir: (deal: NegocioKanban) => void;
  onNovo: (stageId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id });
  const humana = React.useContext(VozDoQuadro);
  const aberta = etapa.type === "open";
  const total = etapa.count ?? etapa.deals.length;
  const fim = React.useRef<HTMLDivElement>(null);
  const carregarMais = React.useRef(onCarregarMais);
  React.useEffect(() => {
    carregarMais.current = onCarregarMais;
  });

  // Rolou até o fim da coluna: pede a próxima página.
  React.useEffect(() => {
    const el = fim.current;
    if (!el || !etapa.temMais || recolhida) return;
    const obs = new IntersectionObserver((entradas) => {
      if (entradas.some((e) => e.isIntersecting)) carregarMais.current();
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [etapa.temMais, recolhida, etapa.deals.length]);

  const vazio = vazioDaEtapa(etapa.type, etapa.name, etapaAnterior);

  return (
    <KanbanColumn
      title={etapa.name}
      count={total}
      total={etapa.totalCents / 100}
      weighted={aberta ? etapa.weightedCents / 100 : undefined}
      collapsed={recolhida}
      onCollapsedChange={onRecolher}
      containerRef={setNodeRef}
      highlighted={isOver}
      data-etapa={etapa.name}
      className="max-h-full snap-start"
      footerNote={etapa.deals.length < total ? `${etapa.deals.length.toLocaleString("pt-BR")} de ${total.toLocaleString("pt-BR")} carregados` : undefined}
      headerActions={
        aberta || etapa.guidance ? (
          <>
            {etapa.guidance && <OrientacaoDaEtapa etapa={etapa.name} texto={etapa.guidance} />}
            {aberta && (
              <IconButton aria-label={`Novo negócio em ${etapa.name}`} tooltip size="sm" onClick={() => onNovo(etapa.id)}>
                <Plus />
              </IconButton>
            )}
          </>
        ) : undefined
      }
    >
      {etapa.deals.map((deal) => (
        <CartaoArrastavel
          key={deal.id}
          deal={deal}
          tipoDaEtapa={etapa.type}
          prazoParado={etapa.rottingDays}
          defs={defs}
          layout={layout}
          agora={agora}
          onAbrir={() => onAbrir(deal)}
        />
      ))}
      {etapa.deals.length === 0 && (
        <div
          className={cn(
            "grid flex-1 place-items-center rounded-md border border-dashed px-3 py-6 text-center text-small",
            arrastandoAlgo ? "border-accent-solid text-accent-fg" : "border-border-default text-text-tertiary"
          )}
        >
          {arrastandoAlgo ? (
            "Solte aqui"
          ) : humana ? (
            <span className="flex flex-col gap-1">
              <span className="text-text-secondary">{vazio.titulo}</span>
              <span className="text-caption">{vazio.dica}</span>
            </span>
          ) : etapa.type === "won" ? (
            "Arraste para cá quando fechar"
          ) : aberta ? (
            "Arraste um negócio ou use o +"
          ) : (
            "Nada aqui"
          )}
        </div>
      )}
      {etapa.temMais && (
        <div ref={fim} className="flex justify-center py-1">
          <Button variant="ghost" size="sm" onClick={onCarregarMais} disabled={carregandoMais}>
            {carregandoMais && <Loader2 size={14} aria-hidden="true" className="animate-spin" />}
            Carregar mais
          </Button>
        </div>
      )}
    </KanbanColumn>
  );
}
