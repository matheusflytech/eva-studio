"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { ICON_REGISTRY, type IconKey } from "./icon-registry";
import { BLOCK_STYLES } from "./block-styles";
import { PALETTE_GROUPS } from "./palette-groups";
import { ESTILO_DA_SAIDA } from "./saida-estilo";
import type { TipoDeSaida } from "./saidas";

export interface FlowEdgeData {
  onInsert?: (iconKey: IconKey) => void;
  /** Nome da saída de onde a ligação parte (Sim, Não, nome da opção...). */
  rotulo?: string | null;
  tipo?: TipoDeSaida;
  [key: string]: unknown;
}

// Blocos que dá para inserir no meio de uma ligação: os da paleta, com os
// mesmos nomes e grupos, menos as ferramentas (ferramenta não fica no
// caminho da conversa, só pendurada na porta de um bloco de IA — inserir uma
// aqui quebrava o fluxo).
const GRUPOS_INSERIVEIS = PALETTE_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.tool) })).filter(
  (g) => g.items.length > 0
);

// Aresta customizada: rótulo da saída numa pílula discreta no meio (para
// ler "Sim"/"Não"/a opção sem seguir a linha até o cartão) e um botão "+"
// que aparece no hover — clicar abre os blocos e insere o escolhido no meio
// da ligação (ver handleInsertOnEdge em builder/page.tsx).
export function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data }: EdgeProps) {
  const [open, setOpen] = React.useState(false);
  const [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const edgeData = data as FlowEdgeData | undefined;
  const estilo = edgeData?.tipo ? ESTILO_DA_SAIDA[edgeData.tipo] : null;

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan group absolute flex items-center gap-1"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
        >
          {edgeData?.rotulo && (
            <span
              className={cn(
                "max-w-[140px] truncate rounded-sm border border-border-default bg-panel px-1.5 py-0.5 text-caption font-medium leading-4",
                estilo?.texto ?? "text-text-secondary"
              )}
            >
              {edgeData.rotulo}
            </span>
          )}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            className={cn(
              "flex size-5 items-center justify-center rounded-full border border-border-strong bg-raised text-text-tertiary transition-opacity hover:text-text-primary group-hover:opacity-100",
              open ? "opacity-100" : "opacity-0"
            )}
            aria-label="Inserir bloco nesta ligação"
            title="Inserir bloco aqui"
          >
            <Plus size={12} />
          </button>

          {open && (
            <div
              onMouseLeave={() => setOpen(false)}
              className="absolute left-1/2 top-6 z-20 w-[220px] -translate-x-1/2 rounded-lg border border-border-default bg-overlay p-1.5 shadow-overlay"
            >
              <div className="nowheel flex max-h-[280px] flex-col gap-1 overflow-y-auto">
                {GRUPOS_INSERIVEIS.map((grupo) => (
                  <div key={grupo.id} className="flex flex-col gap-0.5">
                    <p className="px-2 pb-0.5 pt-1 text-caption font-medium text-text-tertiary">{grupo.label}</p>
                    {grupo.items.map((item) => {
                      const Icon = ICON_REGISTRY[item.key];
                      const blockStyle = BLOCK_STYLES[item.key];
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => {
                            edgeData?.onInsert?.(item.key);
                            setOpen(false);
                          }}
                          className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-small text-text-secondary transition-colors hover:bg-hover hover:text-text-primary"
                        >
                          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", blockStyle.badgeBg, blockStyle.badgeText)}>
                            <Icon size={12} />
                          </span>
                          {item.label}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
