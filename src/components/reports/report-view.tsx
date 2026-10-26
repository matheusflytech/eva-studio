"use client";

import * as React from "react";
import * as echarts from "echarts/core";
import { BarChart, LineChart, PieChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import type { EChartsCoreOption } from "echarts/core";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { NumeroAnimado } from "@/components/crm/negocios/animacao/numero-animado";
import { reduzMovimento } from "@/components/crm/negocios/animacao/gsap";
import type { FiltrosGlobais } from "@/lib/consulta";
import {
  formatarDimensao,
  formatarValor,
  seriesDoResultado,
  type FieldType,
  type ReportQuery,
  type ReportResult,
  type VizType,
} from "@/lib/report-query";

echarts.use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

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
  loading,
  error,
  className,
}: {
  result: ReportResult | null;
  viz: VizType;
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
        ) : viz === "detail" ? (
          <Detalhe result={result} />
        ) : viz === "table" ? (
          <Tabela result={result} />
        ) : (
          <Grafico result={result} viz={viz} />
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
  };
}

function Grafico({ result, viz }: { result: ReportResult; viz: Exclude<VizType, "table" | "detail" | "number"> }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const grafico = React.useRef<echarts.ECharts | null>(null);
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
    const ro = new ResizeObserver(() => g.resize());
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
    grafico.current.setOption(montarOpcao(result, viz, coresDoTema(el)), true);
  }, [result, viz, tema]);

  const { series, semData, cortadas } = seriesDoResultado(result);
  return (
    <div className="flex h-full flex-col">
      <div
        ref={ref}
        role="img"
        aria-label={`${series.map((s) => s.nome).join(", ")}: ${viz === "pie" ? "gráfico de pizza" : viz === "line" || viz === "area" ? "gráfico de linha" : "gráfico de barras"}`}
        className="min-h-48 w-full flex-1"
      />
      {(semData > 0 || cortadas) && (
        <p className="mt-1 text-caption text-text-tertiary">
          {semData > 0 && `${semData.toLocaleString("pt-BR")} ${semData === 1 ? "grupo sem data ficou" : "grupos sem data ficaram"} fora do gráfico (estão na tabela). `}
          {cortadas && "Só as 12 primeiras séries aparecem."}
        </p>
      )}
    </div>
  );
}

type Cores = ReturnType<typeof coresDoTema>;

export function montarOpcao(result: ReportResult, viz: VizType, cores: Cores): EChartsCoreOption {
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
    yAxis: horizontal ? eixoDeCategoria : eixoDeValor,
    series: series.map((s) =>
      viz === "bar" || horizontal
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
