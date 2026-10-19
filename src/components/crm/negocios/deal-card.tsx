"use client";

import * as React from "react";
import { Building2, CalendarDays, CheckCircle2, ListTodo, Users, XCircle, Hourglass } from "lucide-react";
import { cn } from "@/lib/utils";
import { ChipsDeCampos } from "@/components/crm/campos-personalizados";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { dinheiro, diasParado, estaParado, iniciais, type NegocioKanban } from "./modelo";

export function Avatar({ nome, className }: { nome: string; className?: string }) {
  return (
    <span
      title={nome}
      aria-label={`Responsável: ${nome}`}
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-soft text-[10px] font-semibold text-accent-400 ring-1 ring-accent-500/25",
        className
      )}
    >
      {iniciais(nome)}
    </span>
  );
}

function dataCurta(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
}

/**
 * Cartão do negócio. Só o que ajuda a decidir o próximo passo: quem é,
 * quanto vale, quão perto está, o que está atrasado.
 */
export function DealCard({
  deal,
  tipoDaEtapa,
  defs,
  agora,
  arrastando,
}: {
  deal: NegocioKanban;
  tipoDaEtapa: string;
  defs: DefinicaoDeCampo[];
  agora: Date;
  arrastando?: boolean;
}) {
  const fechado = tipoDaEtapa !== "open";
  const parado = estaParado(deal, tipoDaEtapa, agora);
  const atrasado =
    !fechado && deal.expectedClosingAt !== null && new Date(deal.expectedClosingAt).getTime() < agora.getTime();

  return (
    <div
      className={cn(
        "group relative rounded-xl bg-surface-2 p-3 ring-1 ring-border-subtle transition",
        "hover:-translate-y-px hover:bg-surface-3/60 hover:ring-border-strong motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        arrastando && "rotate-[1.5deg] bg-surface-3 shadow-2xl shadow-black/50 ring-accent-500/50",
        tipoDaEtapa === "lost" && "opacity-70"
      )}
    >
      {deal.company && (
        <p className="mb-1 flex items-center gap-1 truncate text-[11px] font-medium text-text-tertiary">
          <Building2 size={11} aria-hidden className="shrink-0" />
          <span className="truncate">{deal.company.name}</span>
        </p>
      )}

      <p className="line-clamp-2 text-[13.5px] font-medium leading-snug text-text-primary">{deal.name}</p>

      <div className="mt-2.5 flex items-end justify-between gap-2">
        <span className="font-display text-[16px] font-semibold tabular-nums text-text-primary">
          {deal.amountCents > 0 ? dinheiro(deal.amountCents) : <span className="text-[12px] font-normal text-text-tertiary">Sem valor</span>}
        </span>
        {tipoDaEtapa === "won" ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
            <CheckCircle2 size={12} aria-hidden /> Ganho
          </span>
        ) : tipoDaEtapa === "lost" ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400">
            <XCircle size={12} aria-hidden /> Perdido
          </span>
        ) : (
          <span className="flex items-center gap-1.5" title={`Chance de fechar: ${deal.probability}%`}>
            <span className="h-1 w-10 overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <span className="block h-full rounded-full bg-accent-500" style={{ width: `${deal.probability}%` }} />
            </span>
            <span className="text-[11px] tabular-nums text-text-tertiary">{deal.probability}%</span>
          </span>
        )}
      </div>

      <ChipsDeCampos defs={defs} valores={deal.customFields} />

      {(deal.owner || deal.contacts.length > 0 || deal.openTasks > 0 || parado || deal.expectedClosingAt) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border-subtle pt-2.5">
          {deal.owner && <Avatar nome={deal.owner.name || "Sem nome"} />}
          {deal.contacts.length > 0 && (
            <span
              className="inline-flex max-w-[9rem] items-center gap-1 truncate text-[11px] text-text-tertiary"
              title={deal.contacts.map((c) => c.name || "Sem nome").join(", ")}
            >
              <Users size={11} aria-hidden className="shrink-0" />
              <span className="truncate">{deal.contacts[0].name || "Sem nome"}</span>
              {deal.contacts.length > 1 && <span>+{deal.contacts.length - 1}</span>}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            {deal.openTasks > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-surface-3 px-1.5 py-0.5 text-[10.5px] text-text-secondary"
                title={`${deal.openTasks} ${deal.openTasks === 1 ? "tarefa aberta" : "tarefas abertas"}`}
              >
                <ListTodo size={11} aria-hidden /> {deal.openTasks}
              </span>
            )}
            {parado && (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-amber-400/12 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-300"
                title="Sem mudar de etapa há mais de 7 dias"
              >
                <Hourglass size={11} aria-hidden /> {diasParado(deal, agora)}d
              </span>
            )}
            {deal.expectedClosingAt && !fechado && (
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px]",
                  atrasado ? "bg-danger/12 font-medium text-danger" : "bg-surface-3 text-text-secondary"
                )}
                title={atrasado ? "Previsão de fechamento já passou" : "Previsão de fechamento"}
              >
                <CalendarDays size={11} aria-hidden /> {dataCurta(deal.expectedClosingAt)}
              </span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}
