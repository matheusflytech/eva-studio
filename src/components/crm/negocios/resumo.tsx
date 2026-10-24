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
      <span className="flex items-center gap-1 text-caption font-medium text-text-tertiary">
        {rotulo}
        {ajuda && !onClick && <Ajuda texto={ajuda} />}
      </span>
      <span className={cn("font-display text-heading font-semibold leading-tight tracking-[-0.02em] tabular-nums", alerta ? "text-amber-300" : "text-text-primary")}>
        {valor}
      </span>
      <span className={cn("truncate text-caption text-text-tertiary", children && "pr-24")}>{detalhe}</span>
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
  ciclo,
}: {
  dados: DadosDoResumo;
  conversao: EtapaDeConversao[];
  /** Mediana de dias entre criar e ganhar; null sem dados. */
  ciclo?: number | null;
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
        <h2 className="text-caption font-medium uppercase tracking-[0.06em] text-text-tertiary">Resumo</h2>
        <button
          type="button"
          onClick={onAlternar}
          aria-expanded={!recolhido}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-caption text-text-tertiary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60"
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

          {temConversao && <JornadaDoFunil conversao={conversao} ciclo={ciclo ?? null} />}
        </>
      )}
    </section>
  );
}

/**
 * Jornada em faixa: um bloco por etapa (quantos chegaram e a fatia do total)
 * ligado ao próximo por uma seta com quantos avançaram. Altura fixa e largura
 * dividida entre as etapas: não estica numa tela larga nem espreme num funil
 * com muitas etapas (rola na horizontal). Ao lado, a leitura em linguagem
 * simples: taxa de ganho, ciclo e o maior gargalo.
 */
function JornadaDoFunil({ conversao, ciclo }: { conversao: EtapaDeConversao[]; ciclo: number | null }) {
  const ultima = conversao[conversao.length - 1];
  const passagens = conversao.map((c, i) =>
    i === 0 || conversao[i - 1].quantidade === 0 ? null : c.quantidade / conversao[i - 1].quantidade
  );
  // Maior queda entre etapas vizinhas; só aponta quando alguém ficou pelo caminho.
  let gargalo = -1;
  let pior = 0.95;
  passagens.forEach((p, i) => {
    if (p !== null && p < pior) {
      pior = p;
      gargalo = i;
    }
  });
  const deCada10 = Math.round(ultima.taxaDoInicio * 100) / 10;

  return (
    <div className="grid gap-4 rounded-xl border border-border-subtle bg-surface-1 p-4 xl:grid-cols-[minmax(0,1fr)_260px]">
      <div className="min-w-0">
        <h3 className="mb-3 flex items-center gap-1 text-caption font-medium text-text-tertiary">
          Jornada dos negócios · últimos 90 dias
          <Ajuda texto="Cada bloco mostra quantos negócios chegaram até a etapa e que fatia isso é de todos os que entraram. A seta mostra quantos dos que estavam na etapa anterior avançaram." />
        </h3>
        <ol className="flex items-stretch overflow-x-auto pb-1" aria-label="Negócios por etapa">
          {conversao.map((c, i) => {
            const fim = i === conversao.length - 1;
            const passagem = passagens[i];
            const ehGargalo = i === gargalo;
            return (
              <li key={c.etapaId} className="flex min-w-[112px] flex-1 items-stretch">
                {passagem !== null && (
                  <div
                    className={cn(
                      "flex w-12 shrink-0 flex-col items-center justify-center gap-0.5 text-caption tabular-nums",
                      ehGargalo ? "text-amber-300" : "text-text-tertiary"
                    )}
                    aria-label={`${Math.round(passagem * 100)}% avançaram de ${conversao[i - 1].nome} para ${c.nome}`}
                  >
                    <span className={cn("font-medium", ehGargalo && "font-semibold")}>{Math.round(passagem * 100)}%</span>
                    <svg width="28" height="8" viewBox="0 0 28 8" aria-hidden>
                      <path d="M0 4h24M20 1l4 3-4 3" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                )}
                <div
                  className={cn(
                    "flex min-w-0 flex-1 flex-col justify-between gap-2 rounded-lg border px-3 py-2.5",
                    fim ? "border-emerald-400/30 bg-emerald-400/[0.06]" : "border-border-subtle bg-surface-2",
                    ehGargalo && "border-amber-400/40"
                  )}
                >
                  <span className="truncate text-caption font-medium text-text-secondary" title={c.nome}>
                    {c.nome}
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className={cn("font-display text-heading font-semibold leading-none tabular-nums", fim ? "text-emerald-400" : "text-text-primary")}>
                      {c.quantidade}
                    </span>
                    <span className="text-caption tabular-nums text-text-tertiary">{Math.round(c.taxaDoInicio * 100)}% do total</span>
                  </span>
                  <span className="h-1 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    <span
                      className="block h-full rounded-full"
                      style={{ width: `${Math.max(c.taxaDoInicio * 100, c.quantidade ? 3 : 0)}%`, background: fim ? "#3fc58a" : "#5b8def" }}
                    />
                  </span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      <aside className="grid grid-cols-2 gap-3 border-t border-border-subtle pt-3 xl:flex xl:flex-col xl:border-l xl:border-t-0 xl:pl-4 xl:pt-0">
        <div>
          <span className="text-caption font-medium text-text-tertiary">Taxa de ganho</span>
          <p className="font-display text-heading font-semibold leading-tight tracking-[-0.02em] text-emerald-400 tabular-nums">
            {Math.round(ultima.taxaDoInicio * 100)}%
          </p>
          <p className="text-caption leading-snug text-text-secondary">
            De cada <strong className="text-text-primary">10</strong> que entram,{" "}
            <strong className="text-text-primary tabular-nums">{deCada10.toLocaleString("pt-BR")}</strong> viram {ultima.nome.toLowerCase()}.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          {ciclo !== null && ciclo > 0 && (
            <div>
              <span className="text-caption font-medium text-text-tertiary">Tempo até fechar</span>
              <p className="text-small text-text-secondary">
                <strong className="font-display text-body-lg font-semibold text-text-primary tabular-nums">{ciclo}</strong>{" "}
                {ciclo === 1 ? "dia" : "dias"} (mediana)
              </p>
            </div>
          )}
          {gargalo > 0 && (
            <p className="rounded-lg bg-amber-400/[0.07] px-2.5 py-2 text-caption leading-snug text-amber-200/90">
              <TrendingDown size={13} aria-hidden className="mr-1 inline align-[-2px] text-amber-300" />
              Maior perda de <strong className="font-medium text-amber-200">{conversao[gargalo - 1].nome}</strong> para{" "}
              <strong className="font-medium text-amber-200">{conversao[gargalo].nome}</strong>: {Math.round((passagens[gargalo] ?? 0) * 100)}% avançam.
            </p>
          )}
        </div>
      </aside>
    </div>
  );
}
