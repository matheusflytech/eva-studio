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
        <CheckCircle2 size={14} className="text-success" />
        Fluxo completo
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-xl bg-warning-subtle px-3 py-1.5 text-[12.5px] font-medium text-warning transition-colors hover:bg-hover"
      >
        <AlertTriangle size={14} />
        {resumoDasPendencias(issues)}
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
                <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-text-primary">
                  <span
                    className={cn(
                      "rounded-sm px-1 text-[10px] font-medium",
                      issue.nivel === "erro" ? "bg-danger-subtle text-danger" : "bg-warning-subtle text-warning"
                    )}
                  >
                    {issue.nivel === "erro" ? "não funciona" : "aviso"}
                  </span>
                  {issue.label}
                </span>
                <span className="text-[11.5px] text-text-tertiary">{issue.motivo}</span>
              </button>
            ))}
          </div>
          <p className="border-t border-border-subtle px-3 pb-1 pt-2 text-[11px] text-text-tertiary">
            O fluxo continua salvando enquanto você monta. O que está marcado como “não funciona” trava a conversa quando ela passar por ali; aviso é só um alerta.
          </p>
        </div>
      )}
    </div>
  );
}

/** "2 pendências · 1 aviso" — pendência é o que o motor não consegue seguir. */
function resumoDasPendencias(issues: FlowIssue[]): string {
  const erros = issues.filter((i) => i.nivel === "erro").length;
  const avisos = issues.length - erros;
  const partes = [];
  if (erros > 0) partes.push(`${erros} ${erros === 1 ? "pendência" : "pendências"}`);
  if (avisos > 0) partes.push(`${avisos} ${avisos === 1 ? "aviso" : "avisos"}`);
  return partes.join(" · ");
}
