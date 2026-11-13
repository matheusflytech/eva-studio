"use client";

import * as React from "react";
import * as echarts from "echarts/core";
import { LineChart } from "echarts/charts";
import { GridComponent, LegendComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import Link from "@/components/contrato/link";
import { ArrowDownRight, ArrowUpRight, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ROTULO_DA_METRICA, METRICAS, type Metrica, type Totais } from "@/lib/disparos/relatorio";
import { ROTULO_DA_QUALIDADE, type NivelDeQualidade } from "@/lib/disparos/qualidade";
import { cn, formatRelativeDate } from "@/lib/utils";

echarts.use([LineChart, GridComponent, LegendComponent, TooltipComponent, SVGRenderer]);

// Relatórios do app de disparos: período (7/30/90 dias) contra o anterior,
// enviados/entregues/lidos/não chegaram/responderam por dia, funil, motivos de
// falha, comparação de chips e de disparos, e exportar CSV.
// Celular primeiro: cartões empilhados, gráfico com rolagem lateral.

interface Relatorio {
  periodo: { dias: number; de: string; ate: string };
  totais: Totais;
  variacao: Record<Metrica, number | null>;
  taxas: { entrega: number; leitura: number; resposta: number; falha: number };
  serie: ({ dia: string } & Totais)[];
  motivos: { motivo: string; total: number }[];
  chips: {
    agentId: string; agente: string; numero: string | null; enviados: number; entregues: number; lidos: number; respostas: number; falhas: number;
    nivel: NivelDeQualidade; taxaDeEntrega: number | null; taxaDeFalha: number | null;
  }[];
  disparos: {
    id: string; agentId: string; agente: string; texto: string; status: string; criadoEm: string;
    total: number; enviados: number; falhas: number; entregues: number; lidos: number; respostas: number;
  }[];
}

const PERIODOS = [7, 30, 90] as const;
// Mesma ordem fixa de cores das séries do Eva (tokens do tema), uma por métrica.
const VAR_DA_METRICA: Record<Metrica, string> = {
  enviados: "--color-accent-solid",
  entregues: "--color-cat-teal-solid",
  lidos: "--color-cat-violet-solid",
  respostas: "--color-cat-amber-solid",
  falhas: "--color-cat-rose-solid",
};
const QUALIDADE: Record<NivelDeQualidade, "success" | "warning" | "danger" | "neutral"> = { boa: "success", atencao: "warning", ruim: "danger", sem_dados: "neutral" };

const fmt = (n: number) => n.toLocaleString("pt-BR");
const pct = (x: number) => `${Math.round(x * 100)}%`;
const pctDe = (parte: number, todo: number) => (todo > 0 ? pct(parte / todo) : "—");

/** `embutido`: dentro do painel inicial (sem margens próprias, título menor, link para a tela). */
export function RelatorioDeDisparos({ embutido = false }: { embutido?: boolean } = {}) {
  const [dias, setDias] = React.useState<(typeof PERIODOS)[number]>(7);
  const [dados, setDados] = React.useState<Relatorio | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    let vivo = true;
    setDados(null);
    fetch(`/api/broadcasts/report?dias=${dias}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Não consegui carregar o relatório.");
        if (vivo) {
          setDados(j);
          setErro(null);
        }
      })
      .catch((e) => vivo && setErro(e instanceof Error ? e.message : "Não consegui carregar o relatório."));
    return () => {
      vivo = false;
    };
  }, [dias]);

  async function exportar() {
    const r = await fetch(`/api/broadcasts/report?dias=${dias}&format=csv`);
    if (!r.ok) return;
    const nome = /filename="([^"]+)"/.exec(r.headers.get("Content-Disposition") ?? "")?.[1] ?? "relatorio-disparos.csv";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(await r.blob());
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  const t = dados?.totais;

  return (
    <div className={cn("flex w-full flex-col gap-5 lg:gap-6", !embutido && "px-4 pb-10 pt-4 sm:px-6 lg:px-8 lg:pt-6")}>
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 sm:flex-1">
          {embutido ? (
            <h2 className="flex items-center gap-3 text-body-lg font-semibold text-text-primary">
              Relatórios
              <Link href="/reports" className="text-small font-medium text-accent-fg">Abrir</Link>
            </h2>
          ) : (
            <h1 className="font-display text-[32px] font-semibold leading-tight tracking-tight text-text-primary">Relatórios</h1>
          )}
          <p className="text-small text-text-tertiary">
            {dados ? `${formatarDia(dados.periodo.de)} a ${formatarDia(dados.periodo.ate)} · comparado aos ${dados.periodo.dias} dias anteriores` : "Carregando…"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div role="group" aria-label="Período" className="flex rounded-full bg-raised p-1">
            {PERIODOS.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={dias === d}
                onClick={() => setDias(d)}
                className={cn("h-9 rounded-full px-3.5 text-small font-medium transition-colors", dias === d ? "bg-text-primary text-bg-base" : "text-text-secondary hover:text-text-primary")}
              >
                {d} dias
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void exportar()}
            disabled={!dados}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-border-default px-4 text-small font-medium text-text-primary hover:bg-hover disabled:opacity-50"
          >
            <Download size={15} aria-hidden /> CSV
          </button>
        </div>
      </header>

      {erro && <p className="rounded-2xl bg-danger-subtle px-4 py-3 text-small text-danger">{erro}</p>}

      {/* Números do período, com a variação contra o anterior. */}
      <section aria-label="Resumo do período" className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {METRICAS.map((m) => {
          const v = dados?.variacao[m] ?? null;
          // Falha subir é ruim; o resto subir é bom.
          const bom = v == null ? null : m === "falhas" ? v <= 0 : v >= 0;
          return (
            <div key={m} className="flex flex-col gap-1 rounded-[22px] border border-border-subtle bg-panel p-4">
              <span className="flex items-center gap-1.5 text-caption text-text-tertiary">
                <i aria-hidden className="h-2 w-2 rounded-full" style={{ background: `var(${VAR_DA_METRICA[m]})` }} />
                {ROTULO_DA_METRICA[m]}
              </span>
              <span className="font-display text-[28px] font-semibold leading-none tabular-nums text-text-primary">{t ? fmt(t[m]) : "—"}</span>
              <span className={cn("flex items-center gap-1 text-caption", bom == null ? "text-text-tertiary" : bom ? "text-success" : "text-danger")}>
                {v == null ? (
                  "sem base anterior"
                ) : (
                  <>
                    {v >= 0 ? <ArrowUpRight size={13} aria-hidden /> : <ArrowDownRight size={13} aria-hidden />}
                    {pct(Math.abs(v))} vs. anterior
                  </>
                )}
              </span>
            </div>
          );
        })}
      </section>

      {/* grid-cols-1 = minmax(0,1fr): sem ele o gráfico de 560px alarga a coluna e a tela rola de lado no celular. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3 lg:gap-6">
        {/* Por dia */}
        <section aria-labelledby="rel-dia" className="rounded-[24px] border border-border-subtle bg-panel p-4 lg:col-span-2 lg:p-5">
          <h2 id="rel-dia" className="mb-2 text-body font-semibold text-text-primary">Por dia</h2>
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="min-w-[560px]">{dados ? <GraficoPorDia serie={dados.serie} /> : <div className="h-[280px]" />}</div>
          </div>
        </section>

        {/* Funil */}
        <section aria-labelledby="rel-funil" className="flex flex-col gap-3 rounded-[24px] border border-border-subtle bg-panel p-4 lg:p-5">
          <h2 id="rel-funil" className="text-body font-semibold text-text-primary">Funil</h2>
          {(["enviados", "entregues", "lidos", "respostas"] as const).map((m) => {
            const base = t?.enviados ?? 0;
            const valor = t?.[m] ?? 0;
            const largura = base > 0 ? Math.max(2, Math.round((valor / base) * 100)) : 0;
            return (
              <div key={m}>
                <div className="mb-1 flex justify-between text-small">
                  <span className="text-text-secondary">{ROTULO_DA_METRICA[m]}</span>
                  <span className="tabular-nums text-text-primary">
                    <b className="font-semibold">{fmt(valor)}</b> <span className="text-text-tertiary">{m === "enviados" ? "" : pctDe(valor, base)}</span>
                  </span>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full" style={{ width: `${largura}%`, background: `var(${VAR_DA_METRICA[m]})` }} />
                </div>
              </div>
            );
          })}
          {dados && (
            <p className="mt-1 text-caption text-text-tertiary">
              {pct(dados.taxas.falha)} das tentativas não chegaram. Quem desliga a confirmação de leitura aparece só como entregue.
            </p>
          )}
        </section>

        {/* Comparação de chips */}
        <section aria-labelledby="rel-chips" className="rounded-[24px] border border-border-subtle bg-panel p-4 lg:col-span-2 lg:p-5">
          <div className="mb-3 flex items-center">
            <h2 id="rel-chips" className="text-body font-semibold text-text-primary">Chips no período</h2>
            <Link href="/chips" className="ml-auto text-small font-medium text-accent-fg">Ver chips</Link>
          </div>
          {!dados || dados.chips.length === 0 ? (
            <p className="text-small text-text-tertiary">{dados ? "Nenhum envio de disparo no período." : "Carregando…"}</p>
          ) : (
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[560px] text-small">
                <thead>
                  <tr className="text-left text-caption text-text-tertiary">
                    <th className="pb-2 font-normal">Chip</th>
                    <th className="pb-2 text-right font-normal">Enviados</th>
                    <th className="pb-2 text-right font-normal">Entrega</th>
                    <th className="pb-2 text-right font-normal">Resposta</th>
                    <th className="pb-2 text-right font-normal">Não chegaram</th>
                    <th className="pb-2 text-right font-normal">Qualidade</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.chips.map((c) => (
                    <tr key={c.agentId} className="border-t border-border-subtle">
                      <td className="py-2.5">
                        <p className="font-medium text-text-primary">{c.agente}</p>
                        {c.numero && <p className="font-mono text-caption text-text-tertiary">{c.numero}</p>}
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-text-primary">{fmt(c.enviados)}</td>
                      <td className="py-2.5 text-right tabular-nums text-text-primary">{pctDe(c.entregues, c.enviados)}</td>
                      <td className="py-2.5 text-right tabular-nums text-text-primary">{pctDe(c.respostas, c.enviados)}</td>
                      <td className={cn("py-2.5 text-right tabular-nums", c.falhas > 0 ? "text-danger" : "text-text-primary")}>{fmt(c.falhas)}</td>
                      <td className="py-2.5 text-right">
                        <Badge variant={QUALIDADE[c.nivel]}>{ROTULO_DA_QUALIDADE[c.nivel]}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Motivos de falha */}
        <section aria-labelledby="rel-motivos" className="flex flex-col gap-3 rounded-[24px] border border-border-subtle bg-panel p-4 lg:p-5">
          <h2 id="rel-motivos" className="text-body font-semibold text-text-primary">Por que não chegou</h2>
          {!dados || dados.motivos.length === 0 ? (
            <p className="text-small text-text-tertiary">{dados ? "Nenhuma falha no período." : "Carregando…"}</p>
          ) : (
            dados.motivos.map((m) => {
              const max = dados.motivos[0].total;
              return (
                <div key={m.motivo}>
                  <div className="mb-1 flex gap-2 text-small">
                    <span className="min-w-0 flex-1 truncate text-text-secondary" title={m.motivo}>{m.motivo}</span>
                    <span className="tabular-nums font-semibold text-text-primary">{fmt(m.total)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                    <div className="h-full rounded-full" style={{ width: `${Math.max(3, Math.round((m.total / max) * 100))}%`, background: `var(${VAR_DA_METRICA.falhas})` }} />
                  </div>
                </div>
              );
            })
          )}
        </section>

        {/* Comparação de disparos */}
        <section aria-labelledby="rel-disparos" className="rounded-[24px] border border-border-subtle bg-panel p-4 lg:col-span-3 lg:p-5">
          <h2 id="rel-disparos" className="mb-3 text-body font-semibold text-text-primary">Disparos no período</h2>
          {!dados || dados.disparos.length === 0 ? (
            <p className="text-small text-text-tertiary">{dados ? "Nenhum disparo criado no período." : "Carregando…"}</p>
          ) : (
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full min-w-[640px] text-small">
                <thead>
                  <tr className="text-left text-caption text-text-tertiary">
                    <th className="pb-2 font-normal">Mensagem</th>
                    <th className="pb-2 text-right font-normal">Total</th>
                    <th className="pb-2 text-right font-normal">Entrega</th>
                    <th className="pb-2 text-right font-normal">Leitura</th>
                    <th className="pb-2 text-right font-normal">Resposta</th>
                    <th className="pb-2 text-right font-normal">Não chegaram</th>
                  </tr>
                </thead>
                <tbody>
                  {dados.disparos.map((d) => (
                    <tr key={d.id} className="border-t border-border-subtle">
                      <td className="max-w-[320px] py-2.5">
                        <Link href={`/broadcasts?agent=${d.agentId}&b=${d.id}`} className="block truncate font-medium text-text-primary hover:underline">
                          {d.texto || "Disparo sem texto"}
                        </Link>
                        <p className="text-caption text-text-tertiary">{d.agente} · {formatRelativeDate(d.criadoEm)}</p>
                      </td>
                      <td className="py-2.5 text-right tabular-nums text-text-primary">{fmt(d.total)}</td>
                      <td className="py-2.5 text-right tabular-nums text-text-primary">{pctDe(d.entregues, d.enviados)}</td>
                      <td className="py-2.5 text-right tabular-nums text-text-primary">{pctDe(d.lidos, d.enviados)}</td>
                      <td className="py-2.5 text-right tabular-nums text-text-primary">{pctDe(d.respostas, d.enviados)}</td>
                      <td className={cn("py-2.5 text-right tabular-nums", d.falhas > 0 ? "text-danger" : "text-text-primary")}>{fmt(d.falhas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function formatarDia(iso: string) {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a}`;
}

/** Linhas por dia (uma por métrica, mesmo eixo: são todas contagens). */
function GraficoPorDia({ serie }: { serie: Relatorio["serie"] }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [tema, setTema] = React.useState(0);

  React.useEffect(() => {
    const obs = new MutationObserver(() => setTema((n) => n + 1));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const g = echarts.init(el, undefined, { renderer: "svg" });
    const s = getComputedStyle(el);
    const v = (n: string) => s.getPropertyValue(n).trim();
    const texto = v("--color-text-tertiary");
    g.setOption({
      animationDuration: 300,
      grid: { left: 8, right: 8, top: 16, bottom: 40, containLabel: true },
      tooltip: {
        trigger: "axis",
        backgroundColor: v("--color-overlay") || v("--color-panel"),
        borderColor: v("--color-border-default"),
        textStyle: { color: v("--color-text-primary"), fontSize: 12 },
        axisPointer: { type: "line", lineStyle: { color: v("--color-border-default") } },
      },
      legend: { bottom: 0, icon: "circle", itemWidth: 8, itemHeight: 8, itemGap: 14, textStyle: { color: texto, fontSize: 11 } },
      xAxis: {
        type: "category",
        data: serie.map((d) => formatarDia(d.dia).slice(0, 5)),
        axisLine: { lineStyle: { color: v("--color-border-subtle") } },
        axisTick: { show: false },
        axisLabel: { color: texto, fontSize: 11 },
      },
      yAxis: {
        type: "value",
        minInterval: 1,
        splitLine: { lineStyle: { color: v("--color-border-subtle") } },
        axisLabel: { color: texto, fontSize: 11 },
      },
      series: METRICAS.map((m) => ({
        name: ROTULO_DA_METRICA[m],
        type: "line",
        data: serie.map((d) => d[m]),
        smooth: false,
        symbol: "circle",
        symbolSize: 8,
        showSymbol: serie.length <= 31,
        lineStyle: { width: 2 },
        itemStyle: { color: v(VAR_DA_METRICA[m]) },
      })),
    });
    const ro = new ResizeObserver(() => g.resize());
    ro.observe(el);
    return () => {
      ro.disconnect();
      g.dispose();
    };
  }, [serie, tema]);

  return <div ref={ref} className="h-[280px] w-full" role="img" aria-label="Disparos por dia: enviados, entregues, lidos, não chegaram e responderam" />;
}
