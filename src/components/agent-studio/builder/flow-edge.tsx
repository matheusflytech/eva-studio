"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from "@xyflow/react";
import { ICON_REGISTRY, type IconKey } from "./icon-registry";
import { BLOCK_DEFAULTS } from "./block-defaults";
import { BLOCK_STYLES } from "./block-styles";

export interface FlowEdgeData {
  onInsert?: (iconKey: IconKey) => void;
  [key: string]: unknown;
}

// Aresta customizada com um botão "+" que aparece no hover, igual n8n — clicar
// abre um menu compacto de blocos e insere o escolhido no meio da conexão
// (o node.tsx substitui a aresta original por duas, uma pra cada lado do bloco
// novo — ver handleInsertOnEdge em builder/page.tsx).
export function FlowEdge({ id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, style, markerEnd, data }: EdgeProps) {
  const [open, setOpen] = React.useState(false);
  const [edgePath, labelX, labelY] = getSmoothStepPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
  const edgeData = data as FlowEdgeData | undefined;

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan group absolute"
          style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`, pointerEvents: "all" }}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
            onMouseLeave={() => setOpen(false)}
            className="flex h-5 w-5 items-center justify-center rounded-full border border-border-strong bg-surface-2 text-text-tertiary opacity-0 shadow-sm transition-opacity hover:text-text-primary group-hover:opacity-100"
            title="Inserir bloco aqui"
          >
            <Plus size={12} />
          </button>

          {open && (
            <div
              onMouseLeave={() => setOpen(false)}
              className="glass-card glass-card-solid absolute left-1/2 top-6 z-20 w-[210px] -translate-x-1/2 rounded-2xl p-2"
            >
              <div className="flex max-h-[260px] flex-col gap-0.5 overflow-y-auto">
                {BLOCK_DEFAULTS.map(({ key, paletteLabel }) => {
                  const Icon = ICON_REGISTRY[key];
                  const blockStyle = BLOCK_STYLES[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { edgeData?.onInsert?.(key); setOpen(false); }}
                      className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-left text-[12.5px] text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
                    >
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg ${blockStyle.badgeBg} ${blockStyle.badgeText}`}>
                        <Icon size={12} />
                      </span>
                      {paletteLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
