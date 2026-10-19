"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { valorCurto } from "./modelo";

export interface EtapaDeConversao {
  etapaId: string;
  nome: string;
  quantidade: number;
  taxaDoInicio: number;
}

/** Linha fina com ponto final destacado. Pontos já normalizados (0 a 1). */
function Sparkline({ pontos, cor }: { pontos: number[]; cor: string }) {
  if (pontos.length < 2) return null;
  const w = 84;
  const h = 28;
  const xy = pontos.map((p, i) => [(i / (pontos.length - 1)) * w, h - 3 - p * (h - 6)] as const);
  const d = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [ux, uy] = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="pointer-events-none absolute bottom-3.5 right-3.5 h-7 w-[84px]" aria-hidden>
      <path d={d} fill="none" stroke={cor} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={ux} cy={uy} r="2" fill={cor} />
    </svg>
  );
}

function Indicador({
  rotulo,
  valor,
  detalhe,
  alerta,
  ativo,
  onClick,
  children,
}: {
  rotulo: string;
  valor: string;
  detalhe: React.ReactNode;
  alerta?: boolean;
  ativo?: boolean;
  onClick?: () => void;
  children?: React.ReactNode;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      {...(onClick ? { type: "button" as const, onClick, "aria-pressed": !!ativo } : {})}
      className={cn(
        "relative flex min-w-0 flex-col gap-0.5 overflow-hidden rounded-xl border bg-surface-1 px-4 py-3.5 text-left transition-colors",
        alerta ? "border-amber-400/35" : "border-border-subtle",
        ativo && "border-amber-400/60 bg-amber-400/[0.06]",
        onClick && "outline-none hover:border-border-default focus-visible:ring-2 focus-visible:ring-accent-500/60"
      )}
    >
      <span className="text-[12px] font-medium text-text-tertiary">{rotulo}</span>
      <span className={cn("font-display text-[24px] font-semibold leading-tight tracking-[-0.02em] tabular-nums", alerta ? "text-amber-300" : "text-text-primary")}>
        {valor}
      </span>
      <span className={cn("truncate text-[11.5px] text-text-tertiary", children && "pr-24")}>{detalhe}</span>
      {children}
    </Tag>
  );
}

export interface DadosDoResumo {
  abertoCents: number;
  abertos: number;
  ponderadoCents: number;
  ganhoMesCents: number;
  ganhosNoMes: number;
  variacaoGanho: number | null;
  /** Ganho acumulado dia a dia no mês, para a linha do cartão. */
  serieGanho: number[];
  atencao: number;
}

export function ResumoDoFunilView({
  dados,
  conversao,
  recolhido,
  onAlternar,
  verAtencao,
  onVerAtencao,
}: {
  dados: DadosDoResumo;
  conversao: EtapaDeConversao[];
  recolhido: boolean;
  onAlternar: () => void;
  verAtencao: boolean;
  onVerAtencao: () => void;
}) {
  const maxSerie = Math.max(1, ...dados.serieGanho);
  const nomeDoMes = new Date().toLocaleDateString("pt-BR", { month: "long", timeZone: "America/Sao_Paulo" });
  const temConversao = conversao.length > 1 && conversao[0].quantidade > 0;

  return (
    <section aria-label="Resumo do funil" className="flex flex-col gap-2.5">
      <div className="flex items-center justify-between">
        <h2 className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-tertiary">Resumo</h2>
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={!recolhido}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12px] text-text-tertiary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60"
        >
          {recolhido ? (
            <>
              Mostrar <ChevronDown size={13} aria-hidden />
            </>
          ) : (
            <>
              Recolher <ChevronUp size={13} aria-hidden />
            </>
          )}
        </button>
      </div>

      {!recolhido && (
        <>
          <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
            <Indicador
              rotulo="Em aberto"
              valor={valorCurto(dados.abertoCents)}
              detalhe={`${dados.abertos} ${dados.abertos === 1 ? "negócio" : "negócios"}`}
            />
            <Indicador rotulo="Previsão ponderada" valor={valorCurto(dados.ponderadoCents)} detalhe="valor × chance da etapa" />
            <Indicador
              rotulo={`Ganho em ${nomeDoMes}`}
              valor={valorCurto(dados.ganhoMesCents)}
              detalhe={
                <>
                  {dados.variacaoGanho !== null && (
                    <span className={dados.variacaoGanho >= 0 ? "text-emerald-400" : "text-danger"}>
                      {dados.variacaoGanho >= 0 ? "+" : ""}
                      {Math.round(dados.variacaoGanho * 100)}%
                    </span>
                  )}
                  {dados.variacaoGanho !== null && " vs mês anterior · "}
                  {dados.ganhosNoMes} {dados.ganhosNoMes === 1 ? "venda" : "vendas"}
                </>
              }
            >
              <Sparkline pontos={dados.serieGanho.map((v) => v / maxSerie)} cor="#3fc58a" />
            </Indicador>
            <Indicador
              rotulo="Precisam de atenção"
              valor={String(dados.atencao)}
              detalhe={verAtencao ? "mostrando só esses · clique para ver todos" : "parados ou com retorno atrasado"}
              alerta={dados.atencao > 0}
              ativo={verAtencao}
              onClick={onVerAtencao}
            />
          </div>

          {temConversao && (
            <div>
              <div
                className="flex h-1.5 gap-[3px] overflow-hidden rounded"
                role="img"
                aria-label={`Conversão nos últimos 90 dias: ${conversao.map((c) => `${c.nome} ${Math.round(c.taxaDoInicio * 100)}%`).join(", ")}`}
              >
                {conversao.map((c, i) => {
                  const ultima = i === conversao.length - 1;
                  return (
                    <i
                      key={c.etapaId}
                      className="block"
                      style={{
                        flex: Math.max(c.taxaDoInicio * 100, 2),
                        background: ultima ? "#3fc58a" : "#5b8def",
                        opacity: ultima ? 1 : 0.35 + (i / Math.max(conversao.length - 1, 1)) * 0.5,
                      }}
                    />
                  );
                })}
              </div>
              <div className="mt-1.5 flex justify-between gap-2 overflow-hidden text-[11px] text-text-tertiary">
                {conversao.map((c) => (
                  <span key={c.etapaId} className="truncate">
                    {c.nome} <span className="tabular-nums">{Math.round(c.taxaDoInicio * 100)}%</span>
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}
