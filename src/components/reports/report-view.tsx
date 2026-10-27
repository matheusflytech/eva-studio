"use client";

import * as React from "react";
import * as echarts from "echarts/core";
import { BarChart, FunnelChart, GaugeChart, LineChart, MapChart, PieChart, SankeyChart, ScatterChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { AlertTriangle, ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NumeroAnimado } from "@/components/crm/negocios/animacao/numero-animado";
import { reduzMovimento } from "@/components/crm/negocios/animacao/gsap";
import type { FiltrosGlobais } from "@/lib/consulta";
import {
  degrausDaCascata,
  formatarDimensao,
  formatarValor,
  ligacoesDoSankey,
  seriesDoResultado,
  tabelaDinamica,
  tendencia,
  type FieldType,
  type ReportQuery,
  type ReportResult,
  type VizType,
} from "@/lib/report-query";

echarts.use([
  BarChart, FunnelChart, GaugeChart, LineChart, MapChart, PieChart, SankeyChart, ScatterChart,
  GridComponent, LegendComponent, TooltipComponent, VisualMapComponent, SVGRenderer,
]);

/** Malha das UFs (IBGE, qualidade mínima): só baixa quando um mapa aparece. */
let malhaDoBrasil: Promise<void> | null = null;
function carregarMalha(): Promise<void> {
  malhaDoBrasil ??= import("./br-uf.json").then((m) => {
    echarts.registerMap("BR", (m.default ?? m) as unknown as Parameters<typeof echarts.registerMap>[1]);
  });
  return malhaDoBrasil;
}

// Busca e desenha o resultado de um cartão do construtor (v2).

/** Busca o resultado; enquanto busca de novo, o anterior fica na tela (esmaecido). Resposta velha é ignorada. */
export function useReportResult(query: ReportQuery | null, globals?: FiltrosGlobais, atraso = 250) {
  const [result, setResult] = React.useState<ReportResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const chave = JSON.stringify({ query, globals });
  const pedido = React.useRef(0);

  React.useEffect(() => {
    if (!query) return;
    const meu = ++pedido.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/reports/query", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, globals }),
        });
        const d = await res.json().catch(() => ({}));
        if (meu !== pedido.current) return;
        if (!res.ok) {
          setError(d.error ?? "Não foi possível calcular.");
        } else {
          setError(null);
          setResult(d.result);
        }
      } catch {
        if (meu === pedido.current) setError("Sem conexão.");
      } finally {
        if (meu === pedido.current) setLoading(false);
      }
    }, atraso);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, atraso]);

  return { result, error, loading };
}

export function ReportView({
  result,
  viz,
  meta,
  loading,
  error,
  className,
}: {
  result: ReportResult | null;
  viz: VizType;
  /** Meta do Indicador e do Progresso. */
  meta?: number;
  loading: boolean;
  error: string | null;
  className?: string;
}) {
  if (error && !result) {
    return (
      <div role="alert" className={cn("flex items-center gap-2 rounded-[14px] bg-raised px-4 py-6 text-small text-text-secondary", className)}>
        <AlertTriangle className="size-4 shrink-0 text-warning" aria-hidden />
        {error}
      </div>
    );
  }
  if (!result) return <div aria-busy className={cn("h-full min-h-40 animate-pulse rounded-[14px] bg-raised", className)} />;
  if (result.rows.length === 0) {
    return <p className={cn("rounded-[14px] bg-raised px-4 py-7 text-center text-small text-text-tertiary", className)}>Sem dados com esses filtros.</p>;
  }

  return (
    <div aria-busy={loading} className={cn("relative flex h-full min-h-0 flex-col transition-opacity", loading && "opacity-60", className)}>
      {error && <p className="mb-2 text-caption text-warning">{error} Mostrando o último resultado.</p>}
      <div className="min-h-0 flex-1">
        {viz === "number" ? (
          <Numero result={result} />
        ) : viz === "trend" ? (
          <Tendencia result={result} />
        ) : viz === "progress" ? (
          <Progresso result={result} meta={meta} />
        ) : viz === "pivot" ? (
          <Dinamica result={result} />
        ) : viz === "detail" ? (
          <Detalhe result={result} />
        ) : viz === "table" ? (
          <Tabela result={result} />
        ) : (
          <Grafico result={result} viz={viz} meta={meta} />
        )}
      </div>
      {result.truncated && (
        <p className="mt-2 text-caption text-text-tertiary">Mostrando as {result.rows.length.toLocaleString("pt-BR")} primeiras linhas. Aumente o limite ou filtre mais.</p>
      )}
    </div>
  );
}

function Numero({ result }: { result: ReportResult }) {
  const i = result.columns.findIndex((c) => c.role === "metric");
  const col = result.columns[i];
  const v = result.rows[0]?.[i];
  return (
    <div className="flex h-full flex-col justify-center">
      <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums text-text-primary">
        {typeof v === "number" ? <NumeroAnimado valor={v} formatar={(n) => formatarValor(n, col.type)} /> : formatarValor(v ?? null, col.type)}
      </p>
      <p className="mt-2 text-small text-text-tertiary">{col.label}</p>
    </div>
  );
}

/** Último período, a variação contra o anterior e a linha de todos os períodos. */
function Tendencia({ result }: { result: ReportResult }) {
  const t = tendencia(result);
  const nums = t.valores.filter((v): v is number => v !== null);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const pontos = t.valores
    .map((v, i) => (v === null ? null : `${(i / Math.max(t.valores.length - 1, 1)) * 100},${max === min ? 50 : 100 - ((v - min) / (max - min)) * 100}`))
    .filter(Boolean)
    .join(" ");
  const sobe = (t.variacao ?? 0) >= 0;
  const Seta = sobe ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="flex h-full flex-col justify-center gap-2">
      <p className="text-small text-text-tertiary">{t.rotuloAtual}</p>
      <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums text-text-primary">
        {t.atual !== null ? <NumeroAnimado valor={t.atual} formatar={(n) => formatarValor(n, t.tipo)} /> : "—"}
      </p>
      <p className="flex flex-wrap items-center gap-1.5 text-small text-text-tertiary">
        {t.variacao !== null && (
          <span className={cn("inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-medium tabular-nums", sobe ? "bg-success/10 text-success" : "bg-danger/10 text-danger")}>
            <Seta size={13} aria-hidden />
            {sobe ? "+" : "−"}
            {Math.abs(t.variacao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
          </span>
        )}
        {t.rotuloAnterior && <span>contra {t.rotuloAnterior} ({formatarValor(t.anterior, t.tipo)})</span>}
      </p>
      {nums.length > 1 && (
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="mt-1 h-12 w-full text-accent-solid" aria-hidden>
          <polyline points={pontos} fill="none" stroke="currentColor" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      )}
    </div>
  );
}

function Progresso({ result, meta }: { result: ReportResult; meta?: number }) {
  const i = result.columns.findIndex((c) => c.role === "metric");
  const col = result.columns[i];
  const v = result.rows[0]?.[i];
  const valor = typeof v === "number" ? v : 0;
  const pct = meta ? valor / meta : null;
  return (
    <div className="flex h-full flex-col justify-center gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[32px] font-semibold leading-none tracking-tight tabular-nums text-text-primary">{formatarValor(v ?? null, col.type)}</p>
        {meta ? <p className="text-small text-text-tertiary tabular-nums">meta {formatarValor(meta, col.type)}</p> : null}
      </div>
      {pct === null ? (
        <p className="text-small text-text-tertiary">Defina a meta ao editar o cartão.</p>
      ) : (
        <>
          <div
            role="progressbar"
            aria-label={col.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(Math.min(pct, 1) * 100)}
            className="h-2.5 overflow-hidden rounded-full bg-raised"
          >
            <div className={cn("h-full rounded-full transition-[width] duration-500", pct >= 1 ? "bg-success" : "bg-accent-solid")} style={{ width: `${Math.min(pct, 1) * 100}%` }} />
          </div>
          <p className="text-small text-text-tertiary tabular-nums">
            {(pct * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% da meta · {col.label}
          </p>
        </>
      )}
    </div>
  );
}

/** Tabela dinâmica: 1º agrupamento nas linhas, 2º nas colunas. */
function Dinamica({ result }: { result: ReportResult }) {
  const p = tabelaDinamica(result);
  const dims = result.columns.filter((c) => c.role === "dimension");
  return (
    <div className="h-full overflow-auto rounded-[10px] border border-border-subtle">
      <table className="w-full text-small">
        <thead className="sticky top-0 bg-panel">
          <tr className="border-b border-border-subtle">
            <th scope="col" className="whitespace-nowrap px-3 py-2 text-left font-medium text-text-tertiary">
              {dims[0]?.label} / {dims[1]?.label}
            </th>
            {p.colunas.map((c) => (
              <th key={c} scope="col" className="whitespace-nowrap px-3 py-2 text-right font-medium text-text-tertiary">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {p.linhas.map((l, r) => (
            <tr key={l} className="border-b border-border-subtle last:border-0 hover:bg-hover">
              <th scope="row" className="max-w-64 truncate whitespace-nowrap px-3 py-1.5 text-left font-normal text-text-primary">{l}</th>
              {p.celulas[r].map((v, c) => (
                <td key={c} className={cn("whitespace-nowrap px-3 py-1.5 text-right tabular-nums", v === null ? "text-text-disabled" : "text-text-primary")}>
                  {formatarValor(v, p.tipo)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Detalhe({ result }: { result: ReportResult }) {
  const linha = result.rows[0];
  return (
    <dl className="grid grid-cols-[minmax(0,40%)_1fr] gap-x-4 gap-y-2 text-small">
      {result.columns.map((c, i) => (
        <React.Fragment key={c.key}>
          <dt className="truncate text-text-tertiary">{c.label}</dt>
          <dd className="truncate text-text-primary tabular-nums">{c.role === "dimension" ? formatarDimensao(linha[i], c) : formatarValor(linha[i], c.type)}</dd>
        </React.Fragment>
      ))}
    </dl>
  );
}

const alinhaDireita = (t: FieldType) => t === "number" || t === "money";

function Tabela({ result }: { result: ReportResult }) {
  return (
    <div className="h-full overflow-auto rounded-[10px] border border-border-subtle">
      <table className="w-full text-small">
        <thead className="sticky top-0 bg-panel">
          <tr className="border-b border-border-subtle">
            {result.columns.map((c) => (
              <th key={c.key} scope="col" className={cn("whitespace-nowrap px-3 py-2 font-medium text-text-tertiary", alinhaDireita(c.type) ? "text-right" : "text-left")}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.map((l, r) => (
            <tr key={r} className="border-b border-border-subtle last:border-0 hover:bg-hover">
              {result.columns.map((c, i) => (
                <td key={c.key} className={cn("max-w-64 truncate whitespace-nowrap px-3 py-1.5 tabular-nums", alinhaDireita(c.type) ? "text-right" : "text-left", l[i] === null ? "text-text-disabled" : "text-text-primary")}>
                  {c.role === "dimension" && c.grain ? formatarDimensao(l[i], c) : formatarValor(l[i], c.type)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── ECharts ────────────────────────────────────────────────────────────────

const VARS_DE_SERIE = ["--color-accent-solid", "--color-cat-teal-solid", "--color-cat-amber-solid", "--color-cat-violet-solid", "--color-cat-rose-solid", "--color-cat-slate-solid"];

/** Cores do tema atual (ECharts precisa da cor resolvida, não da variável). */
function coresDoTema(el: HTMLElement) {
  const s = getComputedStyle(el);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return {
    series: VARS_DE_SERIE.map(v),
    texto: v("--color-text-tertiary"),
    linha: v("--color-border-subtle"),
    painel: v("--color-overlay") || v("--color-panel"),
    borda: v("--color-border-default"),
    primario: v("--color-text-primary"),
    fundo: v("--color-raised"),
  };
}

const DESCRICAO_DO_GRAFICO: Partial<Record<VizType, string>> = {
  pie: "gráfico de pizza",
  line: "gráfico de linha",
  area: "gráfico de área",
  combo: "gráfico de barras e linha",
  gauge: "indicador",
  funnel: "funil",
  scatter: "gráfico de dispersão",
  waterfall: "gráfico de cascata",
  sankey: "diagrama de fluxo",
  map: "mapa do Brasil por UF",
};

function Grafico({ result, viz, meta }: { result: ReportResult; viz: VizType; meta?: number }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const grafico = React.useRef<echarts.ECharts | null>(null);
  const pendente = React.useRef<(() => void) | null>(null);
  const [tema, setTema] = React.useState(0);

  // Troca de tema claro/escuro: redesenha com as cores novas.
  React.useEffect(() => {
    const obs = new MutationObserver(() => setTema((n) => n + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const g = echarts.init(el, undefined, { renderer: "svg" });
    grafico.current = g;
    // Cartão escondido (0 px) não desenha: o mapa quebra sem tamanho. Desenha quando aparecer.
    const ro = new ResizeObserver(() => {
      if (!el.clientWidth || !el.clientHeight) return;
      if (pendente.current) pendente.current();
      else g.resize();
    });
    ro.observe(el);
    return () => {
      ro.disconnect();
      g.dispose();
      grafico.current = null;
    };
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el || !grafico.current) return;
    const desenhar = () => {
      if (!el.clientWidth || !el.clientHeight) {
        pendente.current = desenhar;
        return;
      }
      pendente.current = null;
      grafico.current?.resize();
      grafico.current?.setOption(montarOpcao(result, viz, coresDoTema(el), meta), true);
    };
    if (viz === "map") carregarMalha().then(desenhar);
    else desenhar();
  }, [result, viz, tema, meta]);

  const { series, semData, cortadas: cortou } = seriesDoResultado(result);
  const cortadas = cortou && viz !== "sankey";
  const descartadas = viz === "sankey" ? ligacoesDoSankey(result).descartadas : 0;
  const semUf = viz === "map" ? result.rows.filter((l) => l[0] === null).length : 0;
  return (
    <div className="flex h-full flex-col">
      <div
        ref={ref}
        role="img"
        aria-label={`${series.map((s) => s.nome).join(", ")}: ${DESCRICAO_DO_GRAFICO[viz] ?? "gráfico de barras"}`}
        className="min-h-48 w-full flex-1"
      />
      {(semData > 0 || cortadas || descartadas > 0 || semUf > 0) && (
        <p className="mt-1 text-caption text-text-tertiary">
          {semData > 0 && `${semData.toLocaleString("pt-BR")} ${semData === 1 ? "grupo sem data ficou" : "grupos sem data ficaram"} fora do gráfico (estão na tabela). `}
          {cortadas && "Só as 12 primeiras séries aparecem. "}
          {descartadas > 0 && `${descartadas.toLocaleString("pt-BR")} ${descartadas === 1 ? "ligação de volta ficou" : "ligações de volta ficaram"} fora do fluxo (estão na tabela).`}
          {semUf > 0 && "Quem não tem telefone do Brasil com DDD ficou fora do mapa (está na tabela)."}
        </p>
      )}
    </div>
  );
}

type Cores = ReturnType<typeof coresDoTema>;

/** Fim do eixo do Indicador sem meta: o valor arredondado para cima. */
function fimRedondo(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v * 1.2));
  return Math.ceil((v * 1.2) / p) * p;
}

export function montarOpcao(result: ReportResult, viz: VizType, cores: Cores, meta?: number): EChartsCoreOption {
  const { categorias, series } = seriesDoResultado(result);
  const tipo = series[0]?.tipo ?? "number";
  const animar = !reduzMovimento();
  const tooltip = {
    backgroundColor: cores.painel,
    borderColor: cores.borda,
    textStyle: { color: cores.primario, fontSize: 12 },
    confine: true,
  };
  const comum = {
    color: cores.series,
    animation: animar,
    animationDuration: 500,
    animationEasing: "cubicOut" as const,
    textStyle: { fontFamily: "inherit" },
  };
  const legenda = series.length > 1 ? { bottom: 0, icon: "circle", itemWidth: 8, itemHeight: 8, itemGap: 14, textStyle: { color: cores.texto, fontSize: 11 }, type: "scroll" } : undefined;

  if (viz === "gauge") {
    const i = result.columns.findIndex((c) => c.role === "metric");
    const col = result.columns[i];
    const v = result.rows[0]?.[i];
    const valor = typeof v === "number" ? v : 0;
    return {
      ...comum,
      series: [
        {
          type: "gauge",
          min: 0,
          max: meta ?? fimRedondo(valor),
          startAngle: 205,
          endAngle: -25,
          radius: "95%",
          center: ["50%", "58%"],
          progress: { show: true, roundCap: true, width: 12, itemStyle: { color: meta && valor >= meta ? cores.series[1] : cores.series[0] } },
          axisLine: { roundCap: true, lineStyle: { width: 12, color: [[1, cores.linha]] } },
          axisTick: { show: false },
          splitLine: { show: false },
          axisLabel: { show: false },
          pointer: { show: false },
          anchor: { show: false },
          title: { offsetCenter: [0, "38%"], color: cores.texto, fontSize: 12 },
          detail: { valueAnimation: animar, offsetCenter: [0, "4%"], color: cores.primario, fontSize: 28, fontWeight: 600, formatter: (n: number) => formatarValor(n, col.type) },
          data: [{ value: valor, name: meta ? `meta ${formatarValor(meta, col.type)}` : col.label }],
        },
      ],
    };
  }

  if (viz === "map") {
    const s = series[0];
    const dados = categorias
      .map((name, i) => ({ name, value: s.valores[i] }))
      .filter((d): d is { name: string; value: number } => typeof d.value === "number" && d.name.length === 2);
    const max = Math.max(1, ...dados.map((d) => d.value));
    return {
      ...comum,
      tooltip: {
        ...tooltip,
        trigger: "item",
        formatter: (p: { name: string; value: number }) => `${p.name}: ${Number.isFinite(p.value) ? formatarValor(p.value, s.tipo) : "—"}`,
      },
      visualMap: {
        min: 0,
        max,
        left: 0,
        bottom: 0,
        itemWidth: 8,
        itemHeight: 80,
        calculable: false,
        text: [formatarValor(max, s.tipo, true), "0"],
        textGap: 6,
        inRange: { color: [cores.linha, cores.series[0]] },
        textStyle: { color: cores.texto, fontSize: 10 },
      },
      series: [
        {
          type: "map",
          map: "BR",
          roam: false,
          aspectScale: 1,
          layoutCenter: ["55%", "50%"],
          layoutSize: "95%",
          label: { show: false },
          itemStyle: { areaColor: cores.fundo, borderColor: cores.borda, borderWidth: 0.6 },
          emphasis: { label: { show: true, color: cores.primario, fontSize: 11 }, itemStyle: { areaColor: cores.series[0] } },
          select: { disabled: true },
          data: dados,
        },
      ],
    };
  }

  if (viz === "funnel") {
    const s = series[0];
    return {
      ...comum,
      tooltip: { ...tooltip, trigger: "item", valueFormatter: (v: number) => formatarValor(v, s.tipo) },
      series: [
        {
          type: "funnel",
          sort: "none",
          left: "8%",
          right: "8%",
          top: 8,
          bottom: 8,
          gap: 3,
          minSize: "12%",
          label: { show: true, position: "inside", color: "#fff", fontSize: 11, formatter: (p: { name: string; value: number }) => `${p.name}: ${formatarValor(p.value, s.tipo, true)}` },
          itemStyle: { borderWidth: 0, borderRadius: 4 },
          data: categorias.map((name, i) => ({ name, value: s.valores[i] ?? 0 })),
        },
      ],
    };
  }

  if (viz === "sankey") {
    const { nos, ligacoes } = ligacoesDoSankey(result);
    const s = series[0];
    return {
      ...comum,
      tooltip: { ...tooltip, trigger: "item", valueFormatter: (v: number) => formatarValor(v, s?.tipo ?? "number") },
      series: [
        {
          type: "sankey",
          left: 8,
          right: 110,
          top: 8,
          bottom: 8,
          nodeGap: 10,
          emphasis: { focus: "adjacency" },
          label: { color: cores.texto, fontSize: 11 },
          lineStyle: { color: "gradient", opacity: 0.35, curveness: 0.5 },
          data: nos.map((name) => ({ name })),
          links: ligacoes,
        },
      ],
    };
  }

  if (viz === "scatter") {
    const dim = result.columns.findIndex((c) => c.role === "dimension");
    const [mx, my] = result.columns.map((c, i) => ({ c, i })).filter((x) => x.c.role === "metric");
    const eixo = (m: { c: { label: string; type: FieldType } }) => ({
      type: "value",
      name: m.c.label,
      nameLocation: "middle",
      nameGap: 28,
      nameTextStyle: { color: cores.texto, fontSize: 11 },
      axisLabel: { color: cores.texto, fontSize: 11, formatter: (v: number) => formatarValor(v, m.c.type, true) },
      splitLine: { lineStyle: { color: cores.linha, type: "dashed" } },
    });
    return {
      ...comum,
      grid: { left: 16, right: 16, top: 12, bottom: 32, containLabel: true },
      tooltip: {
        ...tooltip,
        trigger: "item",
        formatter: (p: { data: [number, number, string] }) =>
          `<b>${p.data[2]}</b><br/>${mx.c.label}: ${formatarValor(p.data[0], mx.c.type)}<br/>${my.c.label}: ${formatarValor(p.data[1], my.c.type)}`,
      },
      xAxis: eixo(mx),
      yAxis: { ...eixo(my), nameLocation: "end", nameGap: 8 },
      series: [
        {
          type: "scatter",
          symbolSize: 10,
          data: result.rows
            .filter((l) => typeof l[mx.i] === "number" && typeof l[my.i] === "number")
            .map((l) => [l[mx.i], l[my.i], dim >= 0 ? formatarDimensao(l[dim], result.columns[dim]) : ""]),
        },
      ],
    };
  }

  if (viz === "waterfall") {
    const s = series[0];
    const degraus = degrausDaCascata(s.valores);
    const total = degraus.at(-1)?.acumulado ?? 0;
    return {
      ...comum,
      grid: { left: 8, right: 16, top: 12, bottom: 8, containLabel: true },
      tooltip: {
        ...tooltip,
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (ps: { dataIndex: number; name: string }[]) => {
          const i = ps[0]?.dataIndex ?? 0;
          const v = i < degraus.length ? s.valores[i] : total;
          return `${ps[0]?.name}: ${formatarValor(v ?? null, s.tipo)}`;
        },
      },
      xAxis: {
        type: "category",
        data: [...categorias, "Total"],
        axisLabel: { color: cores.texto, fontSize: 11, hideOverlap: true },
        axisLine: { lineStyle: { color: cores.linha } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: cores.texto, fontSize: 11, formatter: (v: number) => formatarValor(v, s.tipo, true) },
        splitLine: { lineStyle: { color: cores.linha, type: "dashed" } },
      },
      series: [
        { type: "bar", stack: "c", silent: true, itemStyle: { color: "transparent" }, data: [...degraus.map((d) => d.base), Math.min(total, 0)] },
        {
          type: "bar",
          stack: "c",
          barMaxWidth: 28,
          itemStyle: { borderRadius: 3 },
          data: [
            ...degraus.map((d, i) => ({ value: d.valor, itemStyle: { color: (s.valores[i] ?? 0) < 0 ? cores.series[4] : cores.series[0] } })),
            { value: Math.abs(total), itemStyle: { color: cores.series[1] } },
          ],
        },
      ],
    };
  }

  if (viz === "pie") {
    const s = series[0];
    return {
      ...comum,
      tooltip: {
        ...tooltip,
        trigger: "item",
        valueFormatter: (v: number) => formatarValor(v, s.tipo),
      },
      legend: { bottom: 0, icon: "circle", itemWidth: 8, itemHeight: 8, itemGap: 14, textStyle: { color: cores.texto, fontSize: 11 }, type: "scroll" },
      series: [
        {
          type: "pie",
          radius: ["52%", "78%"],
          center: ["50%", "45%"],
          avoidLabelOverlap: true,
          label: { show: false },
          itemStyle: { borderColor: cores.painel, borderWidth: 2, borderRadius: 4 },
          data: categorias.map((name, i) => ({ name, value: s.valores[i] })),
        },
      ],
    };
  }

  const horizontal = viz === "bar_h";
  // Combo: a 1ª medida em barras e as outras em linha; tipo diferente ganha o eixo da direita.
  const combo = viz === "combo";
  const segundoEixo = combo && series.slice(1).some((s) => s.tipo !== tipo);
  const eixoDeValor = {
    type: "value",
    axisLabel: { color: cores.texto, fontSize: 11, formatter: (v: number) => formatarValor(v, tipo, true) },
    splitLine: { lineStyle: { color: cores.linha, type: "dashed" } },
  };
  const eixoDeCategoria = {
    type: "category",
    data: categorias,
    inverse: horizontal,
    axisLabel: { color: cores.texto, fontSize: 11, hideOverlap: true, width: horizontal ? 120 : undefined, overflow: "truncate" },
    axisLine: { lineStyle: { color: cores.linha } },
    axisTick: { show: false },
  };
  return {
    ...comum,
    grid: { left: 8, right: 16, top: 12, bottom: legenda ? 36 : 8, containLabel: true },
    tooltip: {
      ...tooltip,
      trigger: "axis",
      axisPointer: { type: viz === "bar" || horizontal ? "shadow" : "line" },
      valueFormatter: (v: number | null) => formatarValor(v ?? null, tipo),
    },
    legend: legenda,
    xAxis: horizontal ? eixoDeValor : eixoDeCategoria,
    yAxis: horizontal
      ? eixoDeCategoria
      : segundoEixo
        ? [
            eixoDeValor,
            {
              ...eixoDeValor,
              splitLine: { show: false },
              axisLabel: { ...eixoDeValor.axisLabel, formatter: (v: number) => formatarValor(v, series.find((s) => s.tipo !== tipo)!.tipo, true) },
            },
          ]
        : eixoDeValor,
    series: series.map((s, i) =>
      combo
        ? i === 0
          ? { type: "bar", name: s.nome, data: s.valores, barMaxWidth: 28, itemStyle: { borderRadius: [4, 4, 0, 0] } }
          : { type: "line", name: s.nome, data: s.valores, yAxisIndex: segundoEixo && s.tipo !== tipo ? 1 : 0, symbolSize: 6, lineStyle: { width: 2 }, tooltip: { valueFormatter: (v: number | null) => formatarValor(v ?? null, s.tipo) } }
        : viz === "bar" || horizontal
        ? { type: "bar", name: s.nome, data: s.valores, barMaxWidth: 28, itemStyle: { borderRadius: horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0] } }
        : {
            type: "line",
            name: s.nome,
            data: s.valores,
            connectNulls: false,
            showSymbol: categorias.length <= 12,
            symbolSize: 6,
            lineStyle: { width: 2 },
            ...(viz === "area" ? { areaStyle: { opacity: 0.15 } } : {}),
          }
    ),
  };
}
