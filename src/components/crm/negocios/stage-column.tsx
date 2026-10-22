"use client";

import * as React from "react";
import { ChevronsRightLeft, CircleHelp, Loader2, Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/components/ui/kanban-column";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import type { CategoryColor } from "@/lib/design-system/tokens";
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
      className={cn("group/card relative cursor-grab rounded-[14px] active:cursor-grabbing", focusRing, isDragging && "opacity-30")}
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
          className={cn("inline-flex size-7 items-center justify-center rounded-full text-text-tertiary hover:bg-hover hover:text-text-primary", focusRing)}
        >
          <CircleHelp size={14} aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="whitespace-pre-line">{texto}</TooltipContent>
    </Tooltip>
  );
}

/** Cor guardada na etapa (nome) → cor de dado do tema. Sem cor: ganho verde, perda vermelha, aberta neutra. */
const COR_DE_DADO: Record<string, CategoryColor> = {
  slate: "slate",
  blue: "blue",
  violet: "violet",
  amber: "amber",
  emerald: "green",
  rose: "rose",
  cyan: "cyan",
};

export function corDeDadoDaEtapa(cor: string, tipo: string): CategoryColor {
  if (cor && COR_DE_DADO[cor]) return COR_DE_DADO[cor];
  if (tipo === "won") return "green";
  if (tipo === "lost") return "red";
  return "slate";
}

/**
 * Coluna do quadro (v5): sem fundo pintado, cabeçalho com o ponto da cor da
 * etapa, nome, contagem, "+" e recolher; embaixo a chance e a soma. Alvo de
 * soltar do dnd-kit, "Carregar mais" automático ao rolar até o fim (com
 * botão, para teclado). Recolhida vira uma faixa estreita com o nome na
 * vertical.
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
  const corpoId = React.useId();
  const ponto = CATEGORY_CLASSES[corDeDadoDaEtapa(etapa.color, etapa.type)].solid;
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
  // Soltar aqui: só um contorno de destaque, sem pintar a coluna.
  const destaque = isOver ? "bg-accent-subtle ring-1 ring-accent-solid" : "bg-raised/50";

  if (recolhida) {
    return (
      <section
        ref={setNodeRef}
        data-etapa={etapa.name}
        aria-label={`${etapa.name}, ${total} itens (recolhida)`}
        className={cn("flex w-10 shrink-0 snap-start flex-col items-center rounded-[18px] py-2 transition-colors duration-120", destaque)}
      >
        <button
          type="button"
          aria-expanded={false}
          onClick={() => onRecolher(false)}
          className={cn("flex flex-1 flex-col items-center gap-2 rounded-full px-1 py-1 text-text-secondary hover:text-text-primary", focusRing)}
        >
          <span aria-hidden="true" className={cn("size-2 rounded-full", ponto)} />
          <span className="text-small font-medium [writing-mode:vertical-rl]">{etapa.name}</span>
          <span className="font-mono text-caption tabular-nums text-text-tertiary">{total.toLocaleString("pt-BR")}</span>
        </button>
      </section>
    );
  }

  return (
    <section
      ref={setNodeRef}
      data-etapa={etapa.name}
      aria-label={`${etapa.name}, ${total} itens`}
      className={cn("flex max-h-full w-64 shrink-0 snap-start flex-col rounded-[18px] transition-colors duration-120", destaque)}
    >
      <header className="group/cab flex flex-col gap-0.5 px-3 pb-2 pt-2.5">
        <div className="flex h-7 items-center gap-2">
          <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full", ponto)} />
          <h3 className="min-w-0 truncate text-small font-semibold text-text-primary">{etapa.name}</h3>
          <span className="font-mono text-caption tabular-nums text-text-tertiary">{total.toLocaleString("pt-BR")}</span>
          <span className="ml-auto flex items-center">
            {etapa.guidance && <OrientacaoDaEtapa etapa={etapa.name} texto={etapa.guidance} />}
            {aberta && (
              <IconButton aria-label={`Novo negócio em ${etapa.name}`} tooltip size="sm" onClick={() => onNovo(etapa.id)}>
                <Plus />
              </IconButton>
            )}
            <IconButton
              aria-label={`Recolher ${etapa.name}`}
              aria-expanded={true}
              aria-controls={corpoId}
              size="sm"
              onClick={() => onRecolher(true)}
              className="opacity-0 transition-opacity group-hover/cab:opacity-100 focus-visible:opacity-100"
            >
              <ChevronsRightLeft />
            </IconButton>
          </span>
        </div>
        <div
          className="flex items-center justify-between pl-4 font-mono text-caption tabular-nums text-text-tertiary"
          title={aberta ? `Ponderado: ${formatMoney(etapa.weightedCents / 100)}` : undefined}
        >
          <span>{aberta ? `${etapa.probability}%` : etapa.type === "won" ? "ganho" : "perdido"}</span>
          <span className="text-text-secondary">{formatMoney(etapa.totalCents / 100)}</span>
        </div>
      </header>

      <div id={corpoId} className="flex min-h-24 flex-1 flex-col gap-1.5 overflow-y-auto px-1.5 pb-1.5">
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
              "grid flex-1 place-items-center rounded-[14px] border border-dashed px-3 py-6 text-center text-small",
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
          <div ref={fim} className="flex flex-col items-center gap-1 py-1">
            <Button variant="ghost" size="sm" onClick={onCarregarMais} disabled={carregandoMais}>
              {carregandoMais && <Loader2 size={14} aria-hidden="true" className="animate-spin" />}
              Carregar mais
            </Button>
            <span className="font-mono text-caption tabular-nums text-text-tertiary">
              {etapa.deals.length.toLocaleString("pt-BR")} de {total.toLocaleString("pt-BR")}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
