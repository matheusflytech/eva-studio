"use client";

import * as React from "react";
import { CheckCircle2, XCircle, ChevronRight, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { ICON_REGISTRY, type IconKey } from "./icon-registry";

interface FlowStep {
  nodeId: string;
  kind: string;
  label: string;
  output?: string;
  error?: string;
  ms: number;
}

interface Execution {
  id: string;
  conversationId: string;
  status: "success" | "error";
  steps: FlowStep[];
  createdAt: string;
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

// Aba "Execuções" do Builder — lista as últimas rodadas de advanceConversation()
// pra esse agente (cada uma já vem com o passo-a-passo gravado) e abre um
// painel lateral com o detalhe de cada bloco visitado quando clicada.
export function ExecutionsPanel({ agentId }: { agentId: string }) {
  const [executions, setExecutions] = React.useState<Execution[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    fetch(`/api/agents/${agentId}/executions`)
      .then((res) => res.json())
      .then((data) => setExecutions(data.executions ?? []))
      .catch(() => setExecutions([]));
  }, [agentId]);

  React.useEffect(() => {
    load();
  }, [load]);

  const selected = executions?.find((e) => e.id === selectedId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 gap-4 overflow-hidden">
      <div className="flex-1 overflow-y-auto rounded-[18px] border border-border-subtle bg-panel p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-mono text-caption text-text-tertiary">Últimas execuções</p>
          <button
            type="button"
            onClick={load}
            className="flex items-center gap-1 text-caption font-medium text-text-tertiary hover:text-text-primary"
          >
            <RefreshCw size={12} /> Atualizar
          </button>
        </div>

        {executions === null ? (
          <p className="p-4 text-small text-text-tertiary">Carregando…</p>
        ) : executions.length === 0 ? (
          <p className="p-4 text-small text-text-tertiary">
            Nenhuma execução registrada ainda — converse com o agente no Playground pra gerar a primeira.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border-subtle">
            {executions.map((exec) => (
              <button
                key={exec.id}
                type="button"
                onClick={() => setSelectedId(exec.id)}
                className={cn(
                  "flex min-h-[52px] items-center justify-between gap-3 rounded-[12px] px-3 py-2 text-left transition-colors",
                  selectedId === exec.id ? "bg-hover" : "hover:bg-raised"
                )}
              >
                <div className="flex items-center gap-2.5">
                  {exec.status === "success" ? (
                    <CheckCircle2 size={16} className="shrink-0 text-success" />
                  ) : (
                    <XCircle size={16} className="shrink-0 text-danger" />
                  )}
                  <div>
                    <p className="truncate font-mono text-small text-text-primary">{exec.conversationId}</p>
                    <p className="text-caption text-text-tertiary">
                      {formatWhen(exec.createdAt)} · {exec.steps.length} passo{exec.steps.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <ChevronRight size={14} className="shrink-0 text-text-tertiary" />
              </button>
            ))}
          </div>
        )}
      </div>

      {selected && (
        <div className="flex w-[340px] shrink-0 border border-border-subtle bg-panel flex-col overflow-y-auto rounded-[18px] p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="font-mono text-caption text-text-tertiary">Passo a passo</p>
            <button type="button" onClick={() => setSelectedId(null)} className="text-caption text-text-tertiary hover:text-text-primary">
              Fechar
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {selected.steps.map((step, i) => {
              const Icon = ICON_REGISTRY[step.kind as IconKey] ?? ICON_REGISTRY.message;
              return (
                <div key={`${step.nodeId}-${i}`} className="rounded-[14px] bg-raised p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-hover text-text-secondary">
                      <Icon size={12} />
                    </span>
                    <p className="truncate text-small font-medium text-text-primary">{step.label}</p>
                    <span className="ml-auto shrink-0 font-mono text-caption tabular-nums text-text-tertiary">{step.ms}ms</span>
                  </div>
                  {step.output && (
                    <p className="mt-1.5 truncate rounded-lg bg-hover px-2 py-1 font-mono text-caption text-text-tertiary">
                      {step.output}
                    </p>
                  )}
                  {step.error && (
                    <p className="mt-1.5 truncate rounded-lg bg-danger-subtle px-2 py-1 font-mono text-caption text-danger">
                      {step.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
