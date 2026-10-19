"use client";

import * as React from "react";
import { Check, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { tempoNaEtapa } from "./linha-do-tempo";
import type { NegocioDaFicha } from "./use-ficha";

function textoDoTempo(tempo: string, fechado: boolean): string {
  if (fechado) return tempo === "desde hoje" ? "hoje" : tempo;
  return tempo === "desde hoje" ? "entrou hoje nesta etapa" : `${tempo} nesta etapa`;
}

/**
 * Trilha de etapas (o "path" do Salesforce/Pipedrive): as etapas abertas em
 * sequência, a atual em destaque e as anteriores como concluídas. Clicar move.
 * Ganho e perdido não entram na trilha: são decisões, ficam nos botões do
 * cabeçalho (perdido pede motivo, e um clique solto aqui pularia isso).
 */
export function TrilhaDeEtapas({
  deal,
  agora,
  patch,
  onErro,
}: {
  deal: NegocioDaFicha;
  agora: Date;
  patch: (body: Record<string, unknown>) => Promise<string | null>;
  onErro: (msg: string | null) => void;
}) {
  const [movendo, setMovendo] = React.useState<string | null>(null);
  const abertas = deal.pipeline.stages.filter((s) => s.type === "open");
  const ganho = deal.stage.type === "won";
  const perdido = deal.stage.type === "lost";
  // Ganho conclui a trilha inteira; perdido não conclui nada (parou no meio).
  const indiceAtual = ganho ? abertas.length : abertas.findIndex((s) => s.id === deal.stageId);

  async function mover(stageId: string) {
    if (stageId === deal.stageId || movendo) return;
    setMovendo(stageId);
    onErro(null);
    onErro(await patch({ stageId }));
    setMovendo(null);
  }

  return (
    <section aria-label="Etapas do funil" className="rounded-2xl border border-border-subtle bg-surface-1 p-3">
      <ol className="flex gap-1 overflow-x-auto pb-0.5">
        {abertas.map((s, i) => {
          const atual = s.id === deal.stageId;
          const feita = !perdido && i < indiceAtual;
          return (
            <li key={s.id} className="min-w-[112px] flex-1">
              <button
                type="button"
                onClick={() => mover(s.id)}
                disabled={!!movendo}
                aria-current={atual ? "step" : undefined}
                aria-label={atual ? `${s.name} (etapa atual)` : `Mover para ${s.name}`}
                title={`${s.name} · ${s.probability}%`}
                className={cn(
                  "flex h-9 w-full items-center justify-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-accent-500/70 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base disabled:cursor-wait",
                  atual
                    ? "bg-accent-500 text-white"
                    : feita
                      ? "bg-accent-soft text-accent-400 hover:bg-accent-500/20"
                      : "bg-surface-2 text-text-tertiary hover:bg-surface-3 hover:text-text-primary"
                )}
              >
                {movendo === s.id ? (
                  <Loader2 size={13} className="animate-spin" aria-hidden />
                ) : (
                  feita && <Check size={13} strokeWidth={2.5} aria-hidden />
                )}
                <span className="truncate">{s.name}</span>
              </button>
            </li>
          );
        })}
        {(ganho || perdido) && (
          <li className="min-w-[112px] flex-1">
            <span
              className={cn(
                "flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium",
                ganho ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"
              )}
            >
              {ganho ? <ThumbsUp size={13} aria-hidden /> : <ThumbsDown size={13} aria-hidden />}
              <span className="truncate">{deal.stage.name}</span>
            </span>
          </li>
        )}
      </ol>
      <p className="mt-2 flex flex-wrap items-center gap-x-2 px-1 text-[12px] text-text-tertiary">
        <span>
          {ganho || perdido ? "Fechado como" : "Etapa atual:"} <span className="font-medium text-text-secondary">{deal.stage.name}</span>
        </span>
        <span aria-hidden>·</span>
        <span>{textoDoTempo(tempoNaEtapa(deal.stageSince, agora), ganho || perdido)}</span>
        {!ganho && !perdido && (
          <>
            <span aria-hidden>·</span>
            <span>{deal.probability}% de chance</span>
          </>
        )}
        {perdido && deal.lostReason && (
          <>
            <span aria-hidden>·</span>
            <span>Motivo: {deal.lostReason}</span>
          </>
        )}
        {(ganho || perdido) && <span className="basis-full sm:basis-auto sm:ml-auto">Clique numa etapa para reabrir.</span>}
      </p>
    </section>
  );
}
