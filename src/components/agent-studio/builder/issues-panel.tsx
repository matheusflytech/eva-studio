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
      <span className="inline-flex items-center gap-1.5 font-mono text-caption text-text-tertiary">
        <CheckCircle2 size={13} aria-hidden="true" className="text-success" />
        <span className="hidden sm:inline">fluxo completo</span>
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="inline-flex h-8 items-center gap-1.5 rounded-full bg-warning-subtle px-3 text-small font-medium text-warning transition-colors hover:bg-hover"
      >
        <AlertTriangle size={14} />
        {resumoDasPendencias(issues)}
        <ChevronDown size={13} className={cn("transition-transform", aberto && "rotate-180")} />
      </button>

      {aberto && (
        // bg-overlay: sem ele o canvas aparece por baixo do painel.
        <div className="absolute right-0 top-full z-20 mt-2 w-[min(330px,calc(100vw-2rem))] rounded-[14px] border border-border-subtle bg-overlay p-1.5 shadow-overlay">
          <div className="max-h-[300px] overflow-y-auto">
            {issues.map((issue, i) => (
              <button
                key={`${issue.nodeId}-${i}`}
                type="button"
                onClick={() => {
                  onSelect(issue.nodeId);
                  setAberto(false);
                }}
                className="flex w-full flex-col gap-0.5 rounded-[10px] px-3 py-2 text-left transition-colors hover:bg-hover"
              >
                <span className="flex items-center gap-1.5 text-small font-medium text-text-primary">
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-caption font-medium",
                      issue.nivel === "erro" ? "bg-danger-subtle text-danger" : "bg-warning-subtle text-warning"
                    )}
                  >
                    {issue.nivel === "erro" ? "não funciona" : "aviso"}
                  </span>
                  {issue.label}
                </span>
                <span className="text-caption text-text-tertiary">{issue.motivo}</span>
              </button>
            ))}
          </div>
          <p className="border-t border-border-subtle px-3 pb-1 pt-2 text-caption text-text-tertiary">
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
