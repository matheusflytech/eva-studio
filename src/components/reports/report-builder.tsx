"use client";

import * as React from "react";
import {
  ArrowLeft,
  ChartArea,
  ChartBar,
  ChartColumn,
  ChartColumnDecreasing,
  ChartLine,
  ChartNoAxesCombined,
  ChartPie,
  ChartScatter,
  FileText,
  Funnel,
  Gauge,
  Grid3x3,
  Hash,
  Plus,
  Table2,
  Target,
  Trash2,
  TrendingUp,
  Waypoints,
  Map as MapIcon,
  X,
} from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { CURVA, gsap, reduzMovimento, useGSAP } from "@/components/crm/negocios/animacao/gsap";
import { ReportView, useReportResult } from "@/components/reports/report-view";
import { CampoDePedido, EntendiAssim } from "@/components/dashboard/ia-pergunte-a-eva";
import { cn } from "@/lib/utils";
import type { FiltrosGlobais } from "@/lib/consulta";
import {
  DATASETS,
  DATASET_BY_KEY,
  GRAIN_LABEL,
  LIMITE_DE_AGRUPAMENTOS,
  LIMITE_DE_FILTROS,
  LIMITE_DE_METRICAS,
  LIMITE_MAXIMO,
  METRICAS_POR_TIPO,
  METRIC_LABEL,
  OPS_POR_TIPO,
  OP_LABEL,
  QUERY_PADRAO,
  VIZ_COM_META,
  VIZ_TYPES,
  camposDoDataset,
  colunasEfetivas,
  rotuloDaMetrica,
  vizPermitidas,
  type CampoPersonalizado,
  type FieldDef,
  type FilterOp,
  type Grain,
  type Metric,
  type ReportFilter,
  type ReportQuery,
  type VizType,
} from "@/lib/report-query";

export interface ReportCard {
  query: ReportQuery;
  viz: VizType;
  titulo: string;
  /** Indicador e Progresso. */
  meta?: number;
}

const ICONE_DO_VISUAL: Record<VizType, React.ComponentType<{ size?: number }>> = {
  table: Table2,
  detail: FileText,
  number: Hash,
  bar: ChartColumn,
  bar_h: ChartBar,
  line: ChartLine,
  area: ChartArea,
  pie: ChartPie,
  combo: ChartNoAxesCombined,
  trend: TrendingUp,
  gauge: Gauge,
  progress: Target,
  funnel: Funnel,
  pivot: Grid3x3,
  scatter: ChartScatter,
  waterfall: ChartColumnDecreasing,
  sankey: Waypoints,
  map: MapIcon,
};

/** Quando o visual não cabe: o que o resumo precisa ter. */
const PRECISA: Partial<Record<VizType, string>> = {
  combo: "duas medidas e uma separação",
  scatter: "duas medidas e uma separação",
  trend: "uma medida separada por data",
  map: "uma medida separada por UF (pelo DDD ou da empresa)",
  gauge: "uma medida, sem separação",
  progress: "uma medida, sem separação",
  number: "uma medida, sem separação",
  funnel: "uma medida e uma separação",
  waterfall: "uma medida e uma separação",
  pie: "uma medida e uma separação",
  pivot: "uma medida e duas separações",
  sankey: "uma medida e duas separações (de → para)",
};

/** Título sugerido: "Soma de Valor de Negócios por Etapa". */
export function tituloSugerido(q: ReportQuery, campos: FieldDef[]): string {
  const base = DATASET_BY_KEY.get(q.dataset)?.label ?? "";
  const por = q.groupBy.map((g) => campos.find((c) => c.key === g.field)?.label ?? g.field);
  if (q.metrics.length === 0 && por.length === 0) return base;
  const medida = q.metrics.length ? rotuloDaMetrica(q.metrics[0], campos) : "Valores";
  // Minúscula só na palavra que não é sigla ("Etapa" → "etapa"; "UF", "DDD" ficam).
  const minusculo = (t: string) => t.replace(/\p{L}+/gu, (p) => (p.length > 1 && p === p.toUpperCase() ? p : p.toLowerCase()));
  return `${medida} de ${base}${por.length ? ` por ${minusculo(por.join(" e "))}` : ""}`;
}

/** Campos personalizados da entidade da base (negócio ou contato). */
function usePersonalizados(dataset: string | null): CampoPersonalizado[] {
  const entity = dataset ? DATASET_BY_KEY.get(dataset)?.customFields : undefined;
  const [porEntidade, setPorEntidade] = React.useState<Record<string, CampoPersonalizado[]>>({});
  React.useEffect(() => {
    if (!entity || porEntidade[entity]) return;
    let vivo = true;
    fetch(`/api/custom-fields?todos=1&entity=${entity}`)
      .then((r) => (r.ok ? r.json() : { fields: [] }))
      .then((d) => {
        if (vivo) setPorEntidade((p) => ({ ...p, [entity]: Array.isArray(d.fields) ? d.fields : [] }));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [entity, porEntidade]);
  return entity ? porEntidade[entity] ?? [] : [];
}

/** Valores que existem num campo de texto (os 50 mais comuns), para escolher em vez de digitar. */
function useValoresDoCampo(dataset: string, field: string, ligado: boolean): string[] {
  const [valores, setValores] = React.useState<Record<string, string[]>>({});
  const chave = `${dataset}|${field}`;
  React.useEffect(() => {
    if (!ligado || valores[chave]) return;
    let vivo = true;
    const query: ReportQuery = { ...QUERY_PADRAO(dataset), groupBy: [{ field }], limit: 50 };
    fetch("/api/reports/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ query }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo) return;
        const rows: unknown[][] = d?.result?.rows ?? [];
        setValores((p) => ({ ...p, [chave]: rows.map((l) => l[0]).filter((v): v is string => typeof v === "string" && v !== "") }));
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [chave, dataset, field, ligado, valores]);
  return valores[chave] ?? [];
}

/**
 * Construtor de cartões (v2). Primeiro a base ("Escolha seus dados
 * iniciais"), depois filtros, como resumir e ordenar; ao lado, o visual e a
 * prévia calculando de verdade, com os filtros do painel.
 */
export function ReportBuilder({
  inicial,
  globals,
  aoSalvar,
  aoFechar,
}: {
  inicial?: ReportCard;
  globals: FiltrosGlobais;
  aoSalvar: (r: ReportCard) => void;
  aoFechar: () => void;
}) {
  const [query, setQuery] = React.useState<ReportQuery | null>(inicial?.query ?? null);
  const [viz, setViz] = React.useState<VizType>(inicial?.viz ?? "bar");
  const [titulo, setTitulo] = React.useState(inicial?.titulo ?? "");
  const [meta, setMeta] = React.useState(inicial?.meta ? String(inicial.meta) : "");
  const [tituloMexido, setTituloMexido] = React.useState(!!inicial?.titulo);
  const personalizados = usePersonalizados(query?.dataset ?? null);
  const campos = React.useMemo(() => (query ? camposDoDataset(query.dataset, personalizados) : []), [query, personalizados]);
  const permitidas = query ? vizPermitidas(query) : [];
  const vizEfetiva = permitidas.includes(viz) ? viz : permitidas[0] ?? "table";
  const { result, error, loading } = useReportResult(query, globals, 350);
  const raiz = React.useRef<HTMLDivElement>(null);

  // Ao entrar numa base (ou voltar para a lista), as seções sobem em cascata.
  useGSAP(
    () => {
      if (reduzMovimento()) return;
      gsap.from("[data-anim]", { y: 10, opacity: 0, duration: 0.4, stagger: 0.035, ease: CURVA.entrada, clearProps: "all" });
    },
    { scope: raiz, dependencies: [query?.dataset ?? ""] }
  );

  React.useEffect(() => {
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && aoFechar();
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [aoFechar]);

  function mudar(p: Partial<ReportQuery>) {
    setQuery((q) => (q ? { ...q, ...p } : q));
  }

  function aplicarDaEva(r: RespostaDaEvaV2) {
    setQuery(r.relatorio.query);
    setViz(r.relatorio.viz);
    setMeta(r.relatorio.meta ? String(r.relatorio.meta) : "");
    setTitulo(r.titulo);
    setTituloMexido(!!r.titulo);
  }

  const sugestao = query ? tituloSugerido(query, campos) : "";
  const tituloFinal = tituloMexido && titulo.trim() ? titulo.trim() : sugestao;
  const comMeta = VIZ_COM_META.includes(vizEfetiva);
  const metaNum = Number(meta.replace(/\./g, "").replace(",", "."));
  const metaValida = comMeta && Number.isFinite(metaNum) && metaNum > 0 ? metaNum : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6" role="dialog" aria-modal aria-label="Montar cartão">
      <div className="absolute inset-0 bg-backdrop backdrop-blur-sm" onClick={aoFechar} />
      <div ref={raiz} className="relative z-10 flex max-h-[94dvh] w-full max-w-[1180px] flex-col overflow-hidden rounded-[22px] border border-border-subtle bg-overlay shadow-overlay">
        <header className="flex items-start justify-between gap-3 border-b border-border-subtle px-5 py-4">
          <div className="flex min-w-0 items-center gap-2">
            {query && !inicial && (
              <button type="button" onClick={() => setQuery(null)} aria-label="Escolher outra base" className="grid size-8 place-items-center rounded-full text-text-tertiary hover:bg-hover hover:text-text-primary">
                <ArrowLeft size={16} />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-title-sm font-semibold text-text-primary">{query ? DATASET_BY_KEY.get(query.dataset)?.label : "Escolha seus dados iniciais"}</h2>
              <p className="mt-0.5 truncate text-small text-text-secondary">
                {query ? DATASET_BY_KEY.get(query.dataset)?.description : "Cada base junta o que você precisa: negócios com tarefas, produtos, contatos..."}
              </p>
            </div>
          </div>
          <button type="button" onClick={aoFechar} aria-label="Fechar" className="text-text-tertiary hover:text-text-primary">
            <X size={17} />
          </button>
        </header>

        {!query ? (
          <>
            <div className="border-b border-border-subtle px-5 py-4">
              <PedirParaEva atual={null} aoReceber={aplicarDaEva} />
            </div>
            <EscolherBase aoEscolher={(d) => setQuery(QUERY_PADRAO(d))} />
          </>
        ) : (
          <>
            <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] md:overflow-hidden">
              <div className="flex flex-col gap-6 border-border-subtle p-5 md:overflow-y-auto md:border-r">
                <PedirParaEva atual={{ query, viz: vizEfetiva }} aoReceber={aplicarDaEva} />
                <Filtros query={query} campos={campos} mudar={mudar} />
                <Resumo query={query} campos={campos} mudar={mudar} />
                <OrdemELimite query={query} campos={campos} mudar={mudar} />
              </div>

              <div className="flex min-h-[420px] flex-col gap-4 p-5 md:overflow-y-auto">
                <section data-anim>
                  <Label className="mb-2">Visual</Label>
                  {/* Em cima, os que cabem neste resumo; embaixo, os outros (desligados, com o que falta no título). */}
                  <div role="radiogroup" aria-label="Tipo de visual">
                    {[VIZ_TYPES.filter((v) => permitidas.includes(v.key)), VIZ_TYPES.filter((v) => !permitidas.includes(v.key))].map((grupo, g) =>
                      grupo.length === 0 ? null : (
                        <div key={g}>
                          {g === 1 && <p className="mb-2 mt-4 text-caption font-medium uppercase tracking-wide text-text-tertiary">Outros gráficos</p>}
                          <div className="grid grid-cols-4 gap-x-1 gap-y-3 sm:grid-cols-6 md:grid-cols-4 xl:grid-cols-6">
                            {grupo.map((v) => {
                              const Icone = ICONE_DO_VISUAL[v.key];
                              const ok = g === 0;
                              const ativo = vizEfetiva === v.key;
                              return (
                                <button
                                  key={v.key}
                                  type="button"
                                  role="radio"
                                  aria-checked={ativo}
                                  disabled={!ok}
                                  title={ok ? v.label : `${v.label}: precisa de ${PRECISA[v.key] ?? "outro resumo"}`}
                                  onClick={() => setViz(v.key)}
                                  className="group flex flex-col items-center gap-1.5 text-center text-caption leading-tight disabled:cursor-not-allowed"
                                >
                                  <span
                                    className={cn(
                                      "grid size-11 place-items-center rounded-full transition-colors duration-150",
                                      ativo
                                        ? "bg-accent-solid text-white"
                                        : "bg-panel text-accent-fg ring-1 ring-border-subtle group-enabled:group-hover:bg-accent-subtle group-disabled:opacity-40"
                                    )}
                                  >
                                    <Icone size={18} />
                                  </span>
                                  <span className={cn(ativo ? "font-medium text-accent-fg" : "text-text-secondary", !ok && "opacity-50")}>{v.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </section>

                {comMeta && (
                  <div data-anim>
                    <Label htmlFor="rb-meta">Meta</Label>
                    <Input id="rb-meta" inputMode="decimal" placeholder="Ex.: 50000" value={meta} onChange={(e) => setMeta(e.target.value)} className="w-40" />
                  </div>
                )}

                <div data-anim>
                  <Label htmlFor="rb-titulo">Título do cartão</Label>
                  <Input
                    id="rb-titulo"
                    value={tituloMexido ? titulo : sugestao}
                    onChange={(e) => {
                      setTitulo(e.target.value);
                      setTituloMexido(true);
                    }}
                    maxLength={80}
                  />
                </div>

                <div data-anim className="flex min-h-[260px] flex-1 flex-col rounded-[18px] border border-border-subtle bg-panel p-4">
                  <p className="mb-3 text-small font-medium text-text-secondary">{tituloFinal || "Prévia"}</p>
                  <div className="min-h-0 flex-1">
                    <ReportView result={result} viz={vizEfetiva} meta={metaValida} loading={loading} error={error} />
                  </div>
                </div>
              </div>
            </div>

            <footer className="flex items-center justify-end gap-2 border-t border-border-subtle px-5 py-3">
              <Button variant="ghost" onClick={aoFechar}>Cancelar</Button>
              <Button onClick={() => aoSalvar({ query, viz: vizEfetiva, titulo: tituloFinal || "Meu cartão", ...(metaValida ? { meta: metaValida } : {}) })}>
                {inicial ? "Salvar cartão" : "Adicionar ao painel"}
              </Button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

interface RespostaDaEvaV2 {
  relatorio: { query: ReportQuery; viz: VizType; meta?: number };
  titulo: string;
  explicacao: string;
}

/** Pedido em português → cartão pronto (base, filtros, resumo e visual), já saneado no servidor. */
function PedirParaEva({ atual, aoReceber }: { atual: { query: ReportQuery; viz: VizType } | null; aoReceber: (r: RespostaDaEvaV2) => void }) {
  const [carregando, setCarregando] = React.useState(false);
  const [erro, setErro] = React.useState("");
  const [explicacao, setExplicacao] = React.useState("");

  async function enviar(pedido: string) {
    setCarregando(true);
    setErro("");
    try {
      const res = await fetch("/api/analytics/ia/consulta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pedido, modo: "relatorio", ...(atual ? { relatorioAtual: atual } : {}) }),
      });
      const d = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(d?.error ?? "Não deu certo agora. Tenta de novo em instantes.");
        return;
      }
      setExplicacao((d as RespostaDaEvaV2).explicacao);
      aoReceber(d as RespostaDaEvaV2);
    } catch {
      setErro("Sem conexão com o servidor. Confere a internet e tenta de novo.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <section data-anim className="flex flex-col gap-2">
      <CampoDePedido
        id={atual ? "rb-eva-ajuste" : "rb-eva"}
        placeholder={atual ? "Ajuste com a Eva: agora só os ganhos, separe por mês..." : "Peça para a Eva: quanto vendi por mês este ano?"}
        exemplos={atual ? [] : ["Quanto vendi por mês este ano?", "Negócios em aberto por etapa", "Tarefas atrasadas por responsável"]}
        carregando={carregando}
        aoEnviar={enviar}
      />
      {erro ? <p role="alert" className="text-small text-danger">{erro}</p> : explicacao && <EntendiAssim explicacao={explicacao} />}
    </section>
  );
}

function EscolherBase({ aoEscolher }: { aoEscolher: (dataset: string) => void }) {
  const [busca, setBusca] = React.useState("");
  const termo = busca.trim().toLowerCase();
  const lista = DATASETS.filter((d) => !termo || `${d.label} ${d.description} ${d.fields.map((f) => f.label).join(" ")}`.toLowerCase().includes(termo));
  const grupos = [...new Set(lista.map((d) => d.group))];
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      <SearchInput data-anim value={busca} onValueChange={setBusca} aria-label="Buscar base de dados" placeholder="Buscar por base ou campo (ex.: tarefa, produto, etiqueta)" className="max-w-md" autoFocus />
      {lista.length === 0 && <p className="mt-6 text-small text-text-tertiary">Nenhuma base com &ldquo;{busca}&rdquo;.</p>}
      {grupos.map((g) => (
        <section key={g} className="mt-5">
          <h3 data-anim className="mb-2 text-caption font-medium uppercase tracking-wide text-text-tertiary">{g}</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {lista.filter((d) => d.group === g).map((d) => (
              <button
                key={d.key}
                data-anim
                type="button"
                onClick={() => aoEscolher(d.key)}
                className="rounded-[14px] bg-raised px-3.5 py-3 text-left ring-1 ring-border-subtle transition-[box-shadow,background-color] hover:bg-hover hover:ring-border-strong"
              >
                <span className="block text-small font-medium text-text-primary">{d.label}</span>
                <span className="mt-0.5 block text-caption leading-snug text-text-tertiary">{d.description}</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Secao({ n, titulo, dica, children, acao }: { n: number; titulo: string; dica?: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <section data-anim className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-small font-semibold text-text-primary">
          <span className="mr-1.5 text-text-tertiary tabular-nums">{n}.</span>
          {titulo}
        </h3>
        {acao}
      </div>
      {dica && <p className="-mt-1.5 text-caption text-text-tertiary">{dica}</p>}
      {children}
    </section>
  );
}

function BotaoAdicionar({ onClick, children, disabled }: { onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} className="inline-flex w-fit items-center gap-1 rounded-full px-2 py-1 text-small font-medium text-accent-fg hover:bg-accent-subtle disabled:opacity-40">
      <Plus size={14} /> {children}
    </button>
  );
}

function Remover({ onClick, rotulo }: { onClick: () => void; rotulo: string }) {
  return (
    <button type="button" onClick={onClick} aria-label={rotulo} className="grid size-9 shrink-0 place-items-center rounded-[10px] text-text-tertiary hover:bg-danger/10 hover:text-danger">
      <Trash2 size={14} />
    </button>
  );
}

interface Parte {
  query: ReportQuery;
  campos: FieldDef[];
  mudar: (p: Partial<ReportQuery>) => void;
}

// O Select da casa lê as <option> direto dos filhos: isto devolve as opções, não um componente.
function opcoesDeCampo(campos: FieldDef[]) {
  const nativos = campos.filter((c) => !c.key.startsWith("cf:"));
  const seus = campos.filter((c) => c.key.startsWith("cf:"));
  return [
    ...nativos.map((c) => <option key={c.key} value={c.key}>{c.label}</option>),
    ...(seus.length
      ? [
          <optgroup key="cf" label="Seus campos">
            {seus.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </optgroup>,
        ]
      : []),
  ];
}

/** Bom primeiro agrupamento: algo com poucas categorias (etapa, situação...), não o nome. */
const BONS_PARA_SEPARAR = ["stage", "status", "deal_stage", "task_status", "pipeline", "owner", "channel", "type", "tag", "reason", "role", "team", "agent", "to_stage"];

function Filtros({ query, campos, mudar }: Parte) {
  const conds = query.filters.conditions;
  const trocar = (i: number, f: ReportFilter | null) =>
    mudar({ filters: { ...query.filters, conditions: f ? conds.map((c, j) => (j === i ? f : c)) : conds.filter((_, j) => j !== i) } });
  return (
    <Secao
      n={1}
      titulo="Filtrar"
      dica={conds.length === 0 ? "Sem filtro: entram todas as linhas da base." : undefined}
      acao={
        conds.length > 1 ? (
          <SegmentedControl
            label="Como juntar os filtros"
            value={query.filters.logic}
            onChange={(logic) => mudar({ filters: { ...query.filters, logic } })}
            options={[{ value: "and", label: "Todos" }, { value: "or", label: "Qualquer um" }]}
          />
        ) : undefined
      }
    >
      {conds.map((f, i) => (
        <LinhaDeFiltro key={i} dataset={query.dataset} filtro={f} campos={campos} aoMudar={(n) => trocar(i, n)} aoRemover={() => trocar(i, null)} />
      ))}
      <BotaoAdicionar
        disabled={conds.length >= LIMITE_DE_FILTROS || campos.length === 0}
        onClick={() => {
          const c = campos.find((x) => x.type === "date") ?? campos[0];
          mudar({ filters: { ...query.filters, conditions: [...conds, { field: c.key, op: OPS_POR_TIPO[c.type][0] }] } });
        }}
      >
        Adicionar filtro
      </BotaoAdicionar>
    </Secao>
  );
}

function LinhaDeFiltro({
  dataset,
  filtro,
  campos,
  aoMudar,
  aoRemover,
}: {
  dataset: string;
  filtro: ReportFilter;
  campos: FieldDef[];
  aoMudar: (f: ReportFilter) => void;
  aoRemover: () => void;
}) {
  const campo = campos.find((c) => c.key === filtro.field);
  const tipo = campo?.type ?? "text";
  const ops = OPS_POR_TIPO[tipo];
  const escolhe = tipo === "text" && ["eq", "neq", "in", "not_in"].includes(filtro.op);
  const sugestoes = useValoresDoCampo(dataset, filtro.field, escolhe);

  let valor: React.ReactNode = null;
  if (["is_set", "is_empty", "is_true", "is_false", "panel"].includes(filtro.op)) valor = null;
  else if (filtro.op === "in" || filtro.op === "not_in") {
    const marcados = new Set(filtro.values ?? []);
    valor = (
      <div className="flex max-h-32 flex-wrap gap-1 overflow-y-auto rounded-[10px] bg-raised p-1.5 ring-1 ring-border-subtle">
        {sugestoes.length === 0 && <span className="px-1 text-caption text-text-tertiary">Sem valores para escolher.</span>}
        {sugestoes.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={marcados.has(s)}
            onClick={() => {
              const n = new Set(marcados);
              if (n.has(s)) n.delete(s);
              else n.add(s);
              aoMudar({ ...filtro, values: [...n] });
            }}
            className={cn("rounded-full px-2.5 py-0.5 text-caption transition-colors", marcados.has(s) ? "bg-accent-subtle text-accent-fg ring-1 ring-accent-solid/40" : "bg-panel text-text-secondary hover:text-text-primary")}
          >
            {s}
          </button>
        ))}
      </div>
    );
  } else if (filtro.op === "between" && tipo === "date") {
    valor = <DateRangePicker de={filtro.value ?? ""} ate={filtro.to ?? ""} onChange={(de, ate) => aoMudar({ ...filtro, value: de, to: ate })} className="w-full" />;
  } else if (filtro.op === "between") {
    valor = (
      <div className="flex items-center gap-1.5">
        <Input inputMode="decimal" aria-label="De" placeholder="De" value={filtro.value ?? ""} onChange={(e) => aoMudar({ ...filtro, value: e.target.value })} />
        <span className="text-caption text-text-tertiary">e</span>
        <Input inputMode="decimal" aria-label="Até" placeholder="Até" value={filtro.to ?? ""} onChange={(e) => aoMudar({ ...filtro, to: e.target.value })} />
      </div>
    );
  } else if (escolhe && sugestoes.length > 0) {
    valor = (
      <Select aria-label="Valor" value={filtro.value ?? ""} onChange={(e) => aoMudar({ ...filtro, value: e.target.value })}>
        <option value="">Escolha...</option>
        {sugestoes.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
    );
  } else {
    const numerico = tipo !== "text" || filtro.op === "last_days" || filtro.op === "next_days";
    valor = (
      <Input
        aria-label="Valor"
        inputMode={numerico ? "decimal" : undefined}
        placeholder={filtro.op === "last_days" || filtro.op === "next_days" ? "Dias" : tipo === "money" ? "R$" : "Valor"}
        value={filtro.value ?? ""}
        onChange={(e) => aoMudar({ ...filtro, value: e.target.value })}
      />
    );
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-[14px] bg-raised/60 p-2 ring-1 ring-border-subtle">
      <div className="flex items-center gap-1.5">
        <Select
          aria-label="Campo" className="min-w-0 flex-1"
          value={filtro.field}
          onChange={(e) => {
            const novo = campos.find((c) => c.key === e.target.value);
            if (novo) aoMudar({ field: novo.key, op: OPS_POR_TIPO[novo.type].includes(filtro.op) ? filtro.op : OPS_POR_TIPO[novo.type][0] });
          }}
        >
          {opcoesDeCampo(campos)}
        </Select>
        <Select aria-label="Condição" className="min-w-0 flex-1" value={filtro.op} onChange={(e) => aoMudar({ field: filtro.field, op: e.target.value as FilterOp })}>
          {ops.map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
        </Select>
        <Remover onClick={aoRemover} rotulo="Remover filtro" />
      </div>
      {valor}
    </div>
  );
}

function Resumo({ query, campos, mudar }: Parte) {
  const resumindo = query.metrics.length > 0 || query.groupBy.length > 0;
  const comMetrica = campos.filter((c) => METRICAS_POR_TIPO[c.type].length > 0);
  const trocarMetrica = (i: number, m: Metric | null) =>
    mudar({ metrics: m ? query.metrics.map((x, j) => (j === i ? m : x)) : query.metrics.filter((_, j) => j !== i), sort: [] });
  const trocarGrupo = (i: number, g: { field: string; grain?: Grain } | null) =>
    mudar({ groupBy: g ? query.groupBy.map((x, j) => (j === i ? g : x)) : query.groupBy.filter((_, j) => j !== i), sort: [] });

  return (
    <Secao
      n={2}
      titulo="Resumir"
      acao={
        <SegmentedControl
          label="Mostrar linhas ou resumo"
          value={resumindo ? "resumo" : "linhas"}
          onChange={(v) => mudar(v === "linhas" ? { metrics: [], groupBy: [], sort: [] } : { metrics: [{ op: "count" }], sort: [] })}
          options={[{ value: "resumo", label: "Resumo" }, { value: "linhas", label: "Linhas" }]}
        />
      }
    >
      {!resumindo ? (
        <Colunas query={query} campos={campos} mudar={mudar} />
      ) : (
        <>
          <Label className="mb-0">Medir</Label>
          {query.metrics.map((m, i) => {
            const campo = campos.find((c) => c.key === m.field);
            return (
              <div key={i} className="flex items-center gap-1.5">
                <Select
                  aria-label="Medida" className="min-w-0 flex-1"
                  value={m.op}
                  onChange={(e) => {
                    const op = e.target.value as Metric["op"];
                    if (op === "count") return trocarMetrica(i, { op });
                    const ok = campo && METRICAS_POR_TIPO[campo.type].includes(op) ? campo : comMetrica.find((c) => METRICAS_POR_TIPO[c.type].includes(op));
                    trocarMetrica(i, ok ? { op, field: ok.key } : { op: "count" });
                  }}
                >
                  {(Object.keys(METRIC_LABEL) as Metric["op"][]).map((op) => (
                    <option key={op} value={op}>{op === "count" ? "Contagem de linhas" : METRIC_LABEL[op]}</option>
                  ))}
                </Select>
                {m.op !== "count" && (
                  <Select aria-label="Campo da medida" className="min-w-0 flex-1" value={m.field ?? ""} onChange={(e) => trocarMetrica(i, { op: m.op, field: e.target.value })}>
                    {opcoesDeCampo(campos.filter((c) => METRICAS_POR_TIPO[c.type].includes(m.op)))}
                  </Select>
                )}
                {query.metrics.length > 1 && <Remover onClick={() => trocarMetrica(i, null)} rotulo="Remover medida" />}
              </div>
            );
          })}
          <BotaoAdicionar disabled={query.metrics.length >= LIMITE_DE_METRICAS} onClick={() => mudar({ metrics: [...query.metrics, { op: "count" }] })}>
            Outra medida
          </BotaoAdicionar>

          <Label className="mb-0 mt-2">Separar por</Label>
          {query.groupBy.map((g, i) => {
            const campo = campos.find((c) => c.key === g.field);
            return (
              <div key={i} className="flex items-center gap-1.5">
                <Select
                  aria-label="Separar por" className="min-w-0 flex-1"
                  value={g.field}
                  onChange={(e) => {
                    const c = campos.find((x) => x.key === e.target.value);
                    trocarGrupo(i, c?.type === "date" ? { field: e.target.value, grain: g.grain ?? "month" } : { field: e.target.value });
                  }}
                >
                  {opcoesDeCampo(campos)}
                </Select>
                {campo?.type === "date" && (
                  <Select aria-label="Agrupar a data por" className="min-w-0 flex-1" value={g.grain ?? "day"} onChange={(e) => trocarGrupo(i, { field: g.field, grain: e.target.value as Grain })}>
                    {(Object.keys(GRAIN_LABEL) as Grain[]).map((k) => <option key={k} value={k}>Por {GRAIN_LABEL[k]}</option>)}
                  </Select>
                )}
                <Remover onClick={() => trocarGrupo(i, null)} rotulo="Remover separação" />
              </div>
            );
          })}
          {query.groupBy.length === 0 && <p className="text-caption text-text-tertiary">Sem separação: um número só.</p>}
          <BotaoAdicionar
            disabled={query.groupBy.length >= LIMITE_DE_AGRUPAMENTOS}
            onClick={() => {
              const livre = (k: string) => !query.groupBy.some((g) => g.field === k);
              const c =
                BONS_PARA_SEPARAR.map((k) => campos.find((x) => x.key === k && livre(k))).find(Boolean) ??
                campos.find((x) => x.type === "text" && livre(x.key)) ??
                campos[0];
              mudar({ groupBy: [...query.groupBy, c.type === "date" ? { field: c.key, grain: "month" } : { field: c.key }], sort: [] });
            }}
          >
            {query.groupBy.length ? "Separar também por" : "Separar por um campo"}
          </BotaoAdicionar>
        </>
      )}
    </Secao>
  );
}

function Colunas({ query, campos, mudar }: Parte) {
  const escolhidas = colunasEfetivas(query, campos);
  const marcar = (k: string) =>
    mudar({ columns: escolhidas.includes(k) ? escolhidas.filter((x) => x !== k) : [...escolhidas, k], sort: query.sort.filter((s) => s.key !== k || escolhidas.includes(k)) });
  return (
    <>
      <p className="text-caption text-text-tertiary">Escolha os campos que aparecem, na ordem em que você marcar.</p>
      <div className="flex flex-wrap gap-1.5">
        {campos.map((c) => {
          const n = escolhidas.indexOf(c.key);
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={n >= 0}
              onClick={() => marcar(c.key)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-caption transition-colors",
                n >= 0 ? "bg-accent-subtle text-accent-fg ring-1 ring-accent-solid/40" : "bg-raised text-text-secondary ring-1 ring-border-subtle hover:text-text-primary"
              )}
            >
              {n >= 0 && <span className="tabular-nums opacity-70">{n + 1}</span>}
              {c.label}
            </button>
          );
        })}
      </div>
    </>
  );
}

function OrdemELimite({ query, campos, mudar }: Parte) {
  const resumindo = query.metrics.length > 0 || query.groupBy.length > 0;
  const opcoes = resumindo
    ? [
        ...query.groupBy.map((g) => ({ key: g.field, label: campos.find((c) => c.key === g.field)?.label ?? g.field })),
        ...query.metrics.map((m, i) => ({ key: `m${i}`, label: rotuloDaMetrica(m, campos) })),
      ]
    : campos;
  const atual = query.sort[0];
  return (
    <Secao n={3} titulo="Ordenar e limitar">
      <div className="flex flex-wrap items-center gap-1.5">
        <Select
          aria-label="Ordenar por"
          value={atual?.key ?? ""}
          onChange={(e) => mudar({ sort: e.target.value ? [{ key: e.target.value, dir: atual?.dir ?? "desc" }] : [] })}
          className="min-w-44 flex-1"
        >
          <option value="">Ordem automática</option>
          {opcoes.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
        </Select>
        {atual && (
          <SegmentedControl
            label="Direção"
            value={atual.dir}
            onChange={(dir) => mudar({ sort: [{ key: atual.key, dir }] })}
            options={[{ value: "desc", label: "Maior primeiro" }, { value: "asc", label: "Menor primeiro" }]}
          />
        )}
      </div>
      <div className="flex items-center gap-2">
        <Label htmlFor="rb-limite" className="mb-0 shrink-0">Até</Label>
        <Input
          id="rb-limite"
          inputMode="numeric"
          className="w-24"
          value={String(query.limit)}
          onChange={(e) => {
            const n = Math.floor(Number(e.target.value.replace(/\D/g, "")));
            mudar({ limit: Math.min(Math.max(n || 1, 1), LIMITE_MAXIMO) });
          }}
        />
        <span className="text-small text-text-tertiary">linhas (máx. {LIMITE_MAXIMO.toLocaleString("pt-BR")})</span>
      </div>
    </Secao>
  );
}
