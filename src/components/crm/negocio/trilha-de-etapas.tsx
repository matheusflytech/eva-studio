"use client";

import * as React from "react";
import { Hourglass, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { diasSemAtividade, negocioParado, type RegraDaEtapa } from "@/lib/regras-de-etapa";
import type { EtapaDoMovimento, ResultadoDaTentativa } from "@/components/crm/negocios/mudanca-de-etapa";
import { tempoNaEtapa, type ItemDaLinhaDoTempo } from "./linha-do-tempo";
import type { NegocioDaFicha } from "./use-ficha";

const HORA = 3_600_000;
const DIA = 24 * HORA;

function textoDoTempo(tempo: string, fechado: boolean): string {
  if (fechado) return tempo === "desde hoje" ? "hoje" : tempo;
  return tempo === "desde hoje" ? "entrou hoje nesta etapa" : `${tempo} nesta etapa`;
}

/**
 * Quanto tempo o negócio passou em cada etapa (por nome), somando as
 * entradas e saídas da linha do tempo. A etapa atual conta até agora. Sem
 * histórico, só a atual (desde a entrada nela).
 */
function tempoPorEtapa(itens: ItemDaLinhaDoTempo[], deal: NegocioDaFicha, agora: Date): Map<string, number> {
  const soma = new Map<string, number>();
  const somar = (etapa: string, ms: number) => soma.set(etapa, (soma.get(etapa) ?? 0) + Math.max(0, ms));
  const eventos = itens
    .filter((i) => i.tipo === "criado" || i.tipo === "etapa")
    .sort((a, b) => a.em.localeCompare(b.em));
  let atual: string | null = null;
  let desde = 0;
  for (const ev of eventos) {
    const para = ev.tipo === "criado" ? ev.etapa : ev.tipo === "etapa" ? ev.para : null;
    const t = Date.parse(ev.em);
    if (atual) somar(atual, t - desde);
    if (para) {
      atual = para;
      desde = t;
    }
  }
  if (deal.stage.type === "open") {
    if (atual === deal.stage.name) somar(atual, agora.getTime() - desde);
    else if (!soma.has(deal.stage.name)) somar(deal.stage.name, agora.getTime() - Date.parse(deal.stageSince));
  }
  return soma;
}

/** "2d", "5h" ou "<1h". */
function tempoCurto(ms: number): string {
  if (ms >= DIA) return `${Math.floor(ms / DIA)}d`;
  if (ms >= HORA) return `${Math.floor(ms / HORA)}h`;
  return "<1h";
}

/**
 * Trilha de etapas (o "path" do Salesforce/Pipedrive), v5: uma barra por
 * etapa aberta, com o nome e o tempo que o negócio passou nela; a atual em
 * destaque e as anteriores como concluídas. Clicar move pelas regras da etapa
 * (campos obrigatórios → "Complete para mover"). Ganho e perdido não entram
 * na trilha: são decisões, ficam nos botões do topo (perdido pede motivo).
 * Negócio fechado: clicar numa etapa é o "Reabrir" nela.
 */
export function TrilhaDeEtapas({
  deal,
  agora,
  regras,
  itens = [],
  moverEtapa,
}: {
  deal: NegocioDaFicha;
  agora: Date;
  regras: Record<string, RegraDaEtapa>;
  /** Linha do tempo, para o tempo em cada etapa. */
  itens?: ItemDaLinhaDoTempo[];
  moverEtapa: (para: EtapaDoMovimento | null, extra?: Record<string, unknown>) => Promise<ResultadoDaTentativa>;
}) {
  const [movendo, setMovendo] = React.useState<string | null>(null);
  const abertas = deal.pipeline.stages.filter((s) => s.type === "open");
  const ganho = deal.stage.type === "won";
  const perdido = deal.stage.type === "lost";
  const fechado = ganho || perdido;
  // Ganho conclui a trilha inteira; perdido não conclui nada (parou no meio).
  const indiceAtual = ganho ? abertas.length : abertas.findIndex((s) => s.id === deal.stageId);
  const tempos = React.useMemo(() => tempoPorEtapa(itens, deal, agora), [itens, deal, agora]);

  async function mover(s: { id: string; name: string; type: string }) {
    if (s.id === deal.stageId || movendo) return;
    setMovendo(s.id);
    await moverEtapa(s, fechado ? { reabrir: true } : undefined);
    setMovendo(null);
  }

  return (
    <nav aria-label="Etapas do funil" className="min-w-0 flex-1">
      <ol className="flex gap-1.5 overflow-x-auto pb-0.5">
        {abertas.map((s, i) => {
          const atual = s.id === deal.stageId;
          const feita = !perdido && i < indiceAtual;
          const exige = regras[s.id]?.camposObrigatorios.length ?? 0;
          const tempo = tempos.get(s.name);
          return (
            <li key={s.id} className="min-w-20 flex-1">
              <button
                type="button"
                onClick={() => mover(s)}
                disabled={!!movendo}
                aria-current={atual ? "step" : undefined}
                aria-label={atual ? `${s.name} (etapa atual)` : fechado ? `Reabrir em ${s.name}` : `Mover para ${s.name}`}
                title={[`${s.name} · ${s.probability}%`, exige ? `Pede ${exige} ${exige === 1 ? "campo" : "campos"} ao entrar` : "", regras[s.id]?.orientacao ?? ""]
                  .filter(Boolean)
                  .join("\n")}
                className={cn(
                  "group flex w-full flex-col gap-1.5 rounded-md py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-wait",
                  atual ? "text-text-primary" : "text-text-tertiary hover:text-text-primary"
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "block h-1.5 rounded-full transition-colors",
                    atual ? "bg-accent-solid" : feita ? "bg-border-strong" : "bg-hover group-hover:bg-border-default"
                  )}
                />
                <span className="flex items-center gap-1 truncate font-mono text-caption">
                  {movendo === s.id && <Loader2 size={11} className="shrink-0 animate-spin" aria-hidden />}
                  <span className="truncate">
                    {s.name}
                    {tempo !== undefined && ` · ${tempoCurto(tempo)}`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
        {fechado && (
          <li className="min-w-20 flex-1">
            <span className={cn("flex flex-col gap-1.5 py-1", ganho ? "text-success" : "text-danger")}>
              <span aria-hidden className={cn("block h-1.5 rounded-full", ganho ? "bg-success" : "bg-danger")} />
              <span className="flex items-center gap-1 truncate font-mono text-caption">
                {ganho ? <ThumbsUp size={11} aria-hidden /> : <ThumbsDown size={11} aria-hidden />}
                <span className="truncate">{deal.stage.name}</span>
              </span>
            </span>
          </li>
        )}
      </ol>
    </nav>
  );
}

/**
 * O que vale na etapa atual: há quanto tempo, a chance, o aviso de parado, o
 * motivo da perda e a orientação da etapa ("O que fazer nesta etapa").
 */
export function EtapaAtual({ deal, agora, regras }: { deal: NegocioDaFicha; agora: Date; regras: Record<string, RegraDaEtapa> }) {
  const ganho = deal.stage.type === "won";
  const perdido = deal.stage.type === "lost";
  const fechado = ganho || perdido;
  const regra = regras[deal.stageId];
  const parado = negocioParado(deal, deal.stage.type, regra ? regra.diasParado : undefined, agora);

  return (
    <div className="flex flex-col gap-2">
      <p className="font-mono text-caption text-text-tertiary">{fechado ? "Fechado como" : "Etapa atual"}</p>
      <p className="text-body-lg font-medium tracking-tight text-text-primary">{deal.stage.name}</p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-secondary">
        <span>{textoDoTempo(tempoNaEtapa(deal.stageSince, agora), fechado)}</span>
        {!fechado && (
          <>
            <span aria-hidden>·</span>
            <span className="font-mono tabular-nums">{deal.probability}% de chance</span>
          </>
        )}
        {parado && (
          <Badge variant="warning" title={regra?.diasParado ? `Parado: mais de ${regra.diasParado} dias sem atividade nesta etapa` : undefined}>
            <Hourglass size={12} aria-hidden /> Parado há {diasSemAtividade(deal, agora)}d
          </Badge>
        )}
      </p>
      {perdido && (deal.perda?.rotulo || deal.lostReason) && (
        <p className="text-caption text-text-secondary">
          Motivo: {deal.perda?.rotulo || deal.lostReason}
          {deal.perda?.nota ? ` — ${deal.perda.nota}` : ""}
        </p>
      )}
      {!fechado && regra?.orientacao && (
        <p className="whitespace-pre-line text-caption text-text-secondary">
          <span className="font-medium text-text-primary">O que fazer nesta etapa: </span>
          {regra.orientacao}
        </p>
      )}
      {fechado && <p className="text-caption text-text-tertiary">Clique numa etapa da trilha para reabrir nela.</p>}
    </div>
  );
}
