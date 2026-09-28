"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlowIssue } from "./block-validation";

/**
 * Lista do que falta no fluxo, no cabeçalho do Builder.
 *
 * Fica fechada quando não há problema: um painel verde permanente vira
 * ruído e some da atenção. Aberta, cada linha leva ao bloco.
 */
export function IssuesPanel({
  issues,
  onSelect,
}: {
  issues: FlowIssue[];
  onSelect: (nodeId: string) => void;
}) {
  const [aberto, setAberto] = React.useState(false);

  if (issues.length === 0) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12.5px] text-text-tertiary">
        <CheckCircle2 size={14} className="text-emerald-400" />
        Fluxo completo
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400/10 px-3 py-1.5 text-[12.5px] font-medium text-amber-300 transition-colors hover:bg-amber-400/15"
      >
        <AlertTriangle size={14} />
        {issues.length} {issues.length === 1 ? "bloco incompleto" : "blocos incompletos"}
        <ChevronDown size={13} className={cn("transition-transform", aberto && "rotate-180")} />
      </button>

      {aberto && (
        // glass-card-solid: sem ele o canvas aparece por baixo do painel.
        <div className="glass-card glass-card-solid absolute right-0 top-full z-20 mt-2 w-[330px] rounded-2xl p-2">
          <div className="max-h-[300px] overflow-y-auto">
            {issues.map((issue, i) => (
              <button
                key={`${issue.nodeId}-${i}`}
                type="button"
                onClick={() => {
                  onSelect(issue.nodeId);
                  setAberto(false);
                }}
                className="flex w-full flex-col gap-0.5 rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-2"
              >
                <span className="text-[12.5px] font-medium text-text-primary">{issue.label}</span>
                <span className="text-[11.5px] text-text-tertiary">{issue.motivo}</span>
              </button>
            ))}
          </div>
          <p className="border-t border-border-subtle px-3 pb-1 pt-2 text-[11px] text-text-tertiary">
            O fluxo continua salvando. Esses blocos é que não vão funcionar quando a conversa passar por eles.
          </p>
        </div>
      )}
    </div>
  );
}
