"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from "@xyflow/react";
import { cn } from "@/lib/utils";
import type { IconKey } from "./icon-registry";
import { IconeDoBloco, seloDoBloco } from "./icone-do-bloco";
import { PALETTE_GROUPS } from "./palette-groups";
import { ESTILO_DA_SAIDA } from "./saida-estilo";
import type { TipoDeSaida } from "./saidas";

export interface FlowEdgeData {
  onInsert?: (iconKey: IconKey) => void;
  /** Nome da saída de onde a ligação parte (Sim, Não, nome da opção...). */
  rotulo?: string | null;
  tipo?: TipoDeSaida;
  /** A última execução passou por esta ligação: o fio acende. */
  ativa?: boolean;
  [key: string]: unknown;
}

// Blocos que dá para inserir no meio de uma ligação: os da paleta, com os
// mesmos nomes e grupos, menos as ferramentas (ferramenta não fica no
// caminho da conversa, só pendurada na porta de um bloco de IA — inserir uma
// aqui quebrava o fluxo).
const GRUPOS_INSERIVEIS = PALETTE_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.tool) })).filter(
  (g) => g.items.length > 0
);

/**
 * Traços por cima do fio base. O traço base tem cor e espessura fixas no CSS
 * global (de outro dono), por isso o aceso e o selecionado são outro <path>.
 * Ativo: azul do destaque com brilho leve e um pulso tracejado correndo.
 */
function TracoAceso({ caminho, ativa, selecionada }: { caminho: string; ativa: boolean; selecionada: boolean }) {
  if (!ativa && !selecionada) return null;
  return (
    <>
      <path
        d={caminho}
        fill="none"
        stroke="var(--accent-solid)"
        strokeWidth={1.75}
        strokeLinecap="round"
        className={cn("pointer-events-none", ativa && "fluxo-agente-brilho")}
      />
      {ativa && (
        <path
          d={caminho}
          fill="none"
          pathLength={100}
          stroke="var(--accent-fg)"
          strokeWidth={2.5}
          strokeLinecap="round"
          className="fluxo-agente-pulso fluxo-agente-brilho pointer-events-none"
        />
      )}
    </>
  );
}

// Ligação do fluxo: fio fino e curvo, rótulo da saída em mono no meio (para
// ler "Sim"/"Não"/a opção sem seguir a linha até o bloco) e um botão "+" que
// aparece no hover — clicar abre os blocos e insere o escolhido no meio da
// ligação (ver handleInsertOnEdge em builder/page.tsx).
export function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, selected, data }: EdgeProps) {
  const [open, setOpen] = React.useState(false);
  const [edgePath, labelX, labelY] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.35 });
  const edgeData = data as FlowEdgeData | undefined;
  const estilo = edgeData?.tipo ? ESTILO_DA_SAIDA[edgeData.tipo] : null;
  const ativa = !!edgeData?.ativa;

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <TracoAceso caminho={edgePath} ativa={ativa} selecionada={!!selected} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan group absolute flex items-center gap-1"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
        >
          {edgeData?.rotulo && (
            <span
              className={cn(
                "max-w-[140px] truncate rounded-full bg-page px-1.5 font-mono text-caption leading-5",
                ativa ? "text-accent-fg" : estilo?.texto ?? "text-text-tertiary"
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
              "flex size-5 items-center justify-center rounded-full border transition-[opacity,background-color,border-color,color,transform] duration-150 hover:scale-110 active:scale-95 motion-reduce:hover:scale-100 group-hover:opacity-100",
              open
                ? "border-accent-solid bg-accent-solid text-text-on-accent opacity-100"
                : "border-border-default bg-panel text-text-tertiary opacity-0 hover:border-accent-solid hover:bg-accent-solid hover:text-text-on-accent"
            )}
            aria-label="Inserir bloco nesta ligação"
            title="Inserir bloco aqui"
          >
            <Plus size={11} aria-hidden="true" />
          </button>

          {open && (
            <div
              onMouseLeave={() => setOpen(false)}
              className="absolute left-1/2 top-6 z-20 w-[220px] -translate-x-1/2 rounded-[14px] border border-border-default bg-overlay p-1.5 shadow-overlay"
            >
              <div className="nowheel flex max-h-[280px] flex-col gap-1 overflow-y-auto">
                {GRUPOS_INSERIVEIS.map((grupo) => (
                  <div key={grupo.id} className="flex flex-col gap-0.5">
                    <p className="px-2 pb-0.5 pt-1 text-caption font-medium text-text-tertiary">{grupo.label}</p>
                    {grupo.items.map((item) => {
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
                          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-md", seloDoBloco(item.key))}>
                            <IconeDoBloco iconKey={item.key} size={12} />
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

// Fio de ferramenta (da ferramenta até a porta de baixo do bloco de IA):
// tracejado e sem "+", porque não é caminho da conversa.
export function ToolEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, selected }: EdgeProps) {
  const [edgePath] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.35 });
  return (
    <>
      <BaseEdge id={id} path={edgePath} style={{ ...style, strokeDasharray: "4 4" }} />
      <TracoAceso caminho={edgePath} ativa={false} selecionada={!!selected} />
    </>
  );
}
