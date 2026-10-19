"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, CircleHelp, TrendingDown } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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

/** Ícone "?" com a explicação do número. Não usar dentro de botão. */
function Ajuda({ texto }: { texto: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={texto}
          className="inline-flex cursor-help rounded-full text-text-tertiary/70 outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60"
        >
          <CircleHelp size={12} aria-hidden />
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px] leading-snug">{texto}</TooltipContent>
    </Tooltip>
  );
}

function Indicador({
  rotulo,
  valor,
  detalhe,
  ajuda,
  alerta,
  ativo,
  onClick,
  children,
}: {
  rotulo: string;
  valor: string;
  detalhe: React.ReactNode;
  /** Explicação em linguagem simples, mostrada no ícone de ajuda. */
  ajuda?: string;
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
      <span className="flex items-center gap-1 text-[12px] font-medium text-text-tertiary">
        {rotulo}
        {ajuda && !onClick && <Ajuda texto={ajuda} />}
      </span>
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
              ajuda="Soma do valor de todos os negócios que ainda não foram ganhos nem perdidos."
            />
            <Indicador
              rotulo="Previsão ponderada"
              valor={valorCurto(dados.ponderadoCents)}
              detalhe="valor × chance da etapa"
              ajuda="Quanto deve virar venda de verdade: cada negócio conta pelo valor vezes a chance da etapa em que está. Ex.: R$ 10 mil numa etapa de 50% conta R$ 5 mil."
            />
            <Indicador
              rotulo={`Ganho em ${nomeDoMes}`}
              valor={valorCurto(dados.ganhoMesCents)}
              ajuda="Valor dos negócios fechados como ganho neste mês. A linha mostra o acumulado dia a dia; a porcentagem compara com o mesmo período do mês passado."
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

          {temConversao && <JornadaDoFunil conversao={conversao} />}
        </>
      )}
    </section>
  );
}

/**
 * Funil em degraus: quantos negócios chegaram a cada etapa, quanto passou de
 * uma para a outra e onde está a maior perda. Frase de leitura no topo para
 * quem não está acostumado com gráfico de funil.
 */
function JornadaDoFunil({ conversao }: { conversao: EtapaDeConversao[] }) {
  const inicio = conversao[0].quantidade;
  const ultima = conversao[conversao.length - 1];
  const passagens = conversao.map((c, i) =>
    i === 0 || conversao[i - 1].quantidade === 0 ? null : c.quantidade / conversao[i - 1].quantidade
  );
  // Maior queda entre etapas vizinhas (só faz sentido com pelo menos 3 etapas).
  let gargalo = -1;
  if (conversao.length > 2) {
    let pior = 1;
    passagens.forEach((p, i) => {
      if (p !== null && p < pior) {
        pior = p;
        gargalo = i;
      }
    });
    if (pior >= 0.95) gargalo = -1;
  }
  const deCada10 = Math.round(ultima.taxaDoInicio * 10 * 10) / 10;

  return (
    <div className="rounded-xl border border-border-subtle bg-surface-1 px-4 py-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="flex items-center gap-1 text-[12px] font-medium text-text-tertiary">
          Jornada dos negócios · últimos 90 dias
          <Ajuda texto="Cada barra mostra quantos negócios chegaram àquela etapa. O número entre as barras é quantos passaram da etapa anterior para a seguinte." />
        </h3>
        <p className="text-[12.5px] text-text-secondary">
          De cada <strong className="text-text-primary">10</strong> negócios que entram,{" "}
          <strong className="text-emerald-400 tabular-nums">{deCada10.toLocaleString("pt-BR")}</strong> chegam a{" "}
          <strong className="text-text-primary">{ultima.nome}</strong>.
        </p>
      </div>

      <ol className="mt-3 flex items-end gap-1 overflow-x-auto pb-0.5" aria-label="Negócios por etapa">
        {conversao.map((c, i) => {
          const fim = i === conversao.length - 1;
          const altura = Math.max(c.taxaDoInicio, 0.06);
          const passagem = passagens[i];
          const ehGargalo = i === gargalo;
          return (
            <li key={c.etapaId} className="flex min-w-[76px] flex-1 items-end gap-1">
              {passagem !== null && (
                <span
                  className={cn(
                    "mb-6 flex shrink-0 flex-col items-center text-[10.5px] tabular-nums",
                    ehGargalo ? "text-amber-300" : "text-text-tertiary"
                  )}
                  title={`${Math.round(passagem * 100)}% passaram de ${conversao[i - 1].nome} para ${c.nome}`}
                >
                  {ehGargalo && <TrendingDown size={11} aria-hidden />}
                  {Math.round(passagem * 100)}%
                </span>
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex h-16 items-end">
                  <div
                    className={cn("w-full rounded-md transition-[height] duration-500", ehGargalo && "ring-1 ring-amber-400/50")}
                    style={{
                      height: `${altura * 100}%`,
                      background: fim ? "#3fc58a" : "#5b8def",
                      opacity: fim ? 0.9 : 0.4 + (i / Math.max(conversao.length - 1, 1)) * 0.45,
                    }}
                  />
                </div>
                <span className="truncate text-[11.5px] font-medium text-text-secondary" title={c.nome}>
                  {c.nome}
                </span>
                <span className="text-[11px] tabular-nums text-text-tertiary">
                  {c.quantidade} · {Math.round(c.taxaDoInicio * 100)}%
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {gargalo > 0 && (
        <p className="mt-2.5 text-[12px] text-amber-300/90">
          <TrendingDown size={13} aria-hidden className="mr-1.5 inline align-[-2px]" />
          Maior perda entre <strong className="font-medium">{conversao[gargalo - 1].nome}</strong> e{" "}
          <strong className="font-medium">{conversao[gargalo].nome}</strong>: só {Math.round((passagens[gargalo] ?? 0) * 100)}% avançam.
        </p>
      )}
      <span className="sr-only">
        {inicio} negócios entraram no funil.{" "}
        {conversao.map((c) => `${c.nome}: ${c.quantidade}`).join(", ")}.
      </span>
    </div>
  );
}
