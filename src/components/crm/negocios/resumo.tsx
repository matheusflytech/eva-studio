"use client";

import * as React from "react";
import { CircleDollarSign, Hourglass, Target, Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { valorCurto, type ResumoDoFunil } from "./modelo";

function Indicador({
  icone: Icone,
  rotulo,
  valor,
  detalhe,
  tom = "accent",
  ativo,
  onClick,
}: {
  icone: React.ComponentType<{ size?: number; className?: string; "aria-hidden"?: boolean }>;
  rotulo: string;
  valor: string;
  detalhe: string;
  tom?: "accent" | "emerald" | "amber";
  ativo?: boolean;
  onClick?: () => void;
}) {
  const cores = {
    accent: "bg-accent-soft text-accent-400",
    emerald: "bg-emerald-400/12 text-emerald-400",
    amber: "bg-amber-400/12 text-amber-300",
  }[tom];
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick, "aria-pressed": !!ativo } : {})}
      className={cn(
        "flex min-w-0 items-start gap-3 rounded-2xl bg-surface-1/70 p-3 text-left ring-1 transition-colors sm:p-4",
        ativo ? "ring-amber-400/50" : "ring-border-subtle",
        onClick && "outline-none hover:ring-border-strong focus-visible:ring-2 focus-visible:ring-accent-500/60"
      )}
    >
      <span className={cn("hidden h-9 w-9 shrink-0 place-items-center rounded-xl min-[420px]:grid", cores)}>
        <Icone size={17} aria-hidden />
      </span>
      <span className="min-w-0">
        <span className="block text-[12px] font-medium text-text-tertiary">{rotulo}</span>
        <span className="mt-0.5 block font-display text-[20px] font-semibold leading-tight tabular-nums text-text-primary">{valor}</span>
        <span className="mt-0.5 block truncate text-[11.5px] text-text-tertiary">{detalhe}</span>
      </span>
    </Tag>
  );
}

export function ResumoDoFunilView({
  resumo,
  soParados,
  onAlternarParados,
}: {
  resumo: ResumoDoFunil;
  soParados: boolean;
  onAlternarParados: () => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-3 2xl:grid-cols-4">
      <Indicador
        icone={CircleDollarSign}
        rotulo="Em aberto"
        valor={valorCurto(resumo.abertoCents)}
        detalhe={`${resumo.abertos} ${resumo.abertos === 1 ? "negócio" : "negócios"} em andamento`}
      />
      <Indicador
        icone={Target}
        rotulo="Previsão ponderada"
        valor={valorCurto(resumo.ponderadoCents)}
        detalhe="Valor × chance de cada etapa"
      />
      <Indicador
        icone={Trophy}
        tom="emerald"
        rotulo="Ganho no mês"
        valor={valorCurto(resumo.ganhoNoMesCents)}
        detalhe={resumo.ganhosNoMes === 0 ? "Nenhuma venda ainda este mês" : `${resumo.ganhosNoMes} ${resumo.ganhosNoMes === 1 ? "venda" : "vendas"} fechadas`}
      />
      <Indicador
        icone={Hourglass}
        tom="amber"
        rotulo="Precisam de atenção"
        valor={String(resumo.parados)}
        detalhe={soParados ? "Mostrando só os parados · clique para ver todos" : "Parados há mais de 7 dias · clique para ver"}
        ativo={soParados}
        onClick={onAlternarParados}
      />
    </div>
  );
}
