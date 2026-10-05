"use client";

import * as React from "react";
import Link from "next/link";
import {
  RefreshCw, Plus, X, Pencil, ArrowLeft, ArrowRight, Check, LayoutGrid,
  Hash, LineChart, PieChart, BarChart3, Table2, RotateCcw,
} from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AreaChart } from "@/components/charts/area-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { cn, formatRelativeDate } from "@/lib/utils";
import { ConstrutorDeConsulta, type ResultadoDoConstrutor } from "@/components/dashboard/construtor-de-consulta";
import { ConteudoDeConsulta } from "@/components/dashboard/resultado-de-consulta";
import { descreverConsulta, tiposPermitidos as tiposPermitidos_, type Consulta } from "@/lib/consulta";

// ---------------------------------------------------------------------------
// Dashboard montado pela própria pessoa.
//
// A estrutura visual veio do dashboard antigo do usuário; o que mudou é que
// os cartões deixaram de ser fixos. Você escolhe o tipo (número, linha,
// pizza, barras, tabela), escolhe de onde o número sai e dá o nome que quiser.
//
// Duas decisões que sustentam o resto:
//
// 1. Escolher a FONTE vem antes de escolher o tipo, e cada fonte diz em uma
//    linha de onde o número sai. Quem monta painel está escolhendo um número,
//    não um campo de banco — e tipo de gráfico sem dado é decoração.
// 2. Tipo incompatível com a fonte nem aparece. Pizza de série temporal não é
//    um erro pra avisar depois: é uma opção que não deveria existir.
// ---------------------------------------------------------------------------

const PERIODOS = [
  { label: "Hoje", dias: 1 },
  { label: "7 dias", dias: 7 },
  { label: "30 dias", dias: 30 },
  { label: "90 dias", dias: 90 },
  { label: "6 meses", dias: 180 },
];

const CANAL_LABEL: Record<string, string> = {
  whatsapp_meta: "WhatsApp oficial", whatsapp_qr: "WhatsApp", instagram: "Instagram",
  messenger: "Messenger", telegram: "Telegram", tiktok: "TikTok",
  webchat: "Site", website: "Site", "sem canal": "Sem canal",
};

interface Fonte {
  chave: string;
  rotulo: string;
  explicacao: string;
  tipo: "numero" | "serie" | "quebra" | "tabela";
  formato?: "dinheiro" | "inteiro" | "porcento";
  grupo: string;
}

interface Widget {
  id: string;
  tipo: "numero" | "linha" | "pizza" | "barras" | "tabela";
  fonte: string;
  titulo: string;
  largura: number;
  /** Só para fonte "custom": o cartão que a pessoa montou. */
  consulta?: Consulta;
}

interface Rotulos {
  campos: { key: string; label: string }[];
  funis: { id: string; name: string }[];
}

interface Ponto { label: string; value: number }
interface LinhaTabela {
  id: string; quando: string | null; titulo: string;
  contato: string; responsavel: string; valorCents: number;
}

interface Dados {
  catalogo: Fonte[];
  numeros: Record<string, number | null>;
  series: Record<string, Ponto[]>;
  quebras: Record<string, Ponto[]>;
  tabelas: Record<string, LinhaTabela[]>;
}

/** Que cartões cada tipo de fonte aceita. É isto que impede pizza de série. */
const TIPOS_POR_FONTE: Record<Fonte["tipo"], Widget["tipo"][]> = {
  numero: ["numero"],
  serie: ["linha", "barras"],
  quebra: ["pizza", "barras"],
  tabela: ["tabela"],
};

const ICONE_DO_TIPO: Record<Widget["tipo"], React.ComponentType<{ size?: number; className?: string }>> = {
  numero: Hash, linha: LineChart, pizza: PieChart, barras: BarChart3, tabela: Table2,
};

const NOME_DO_TIPO: Record<Widget["tipo"], string> = {
  numero: "Número", linha: "Linha", pizza: "Pizza", barras: "Barras", tabela: "Tabela",
};

function formatar(valor: number | null, formato: Fonte["formato"]): string {
  if (valor === null || valor === undefined) return "—";
  if (formato === "dinheiro") {
    return (valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (formato === "porcento") return `${(valor * 100).toFixed(1)}%`;
  return valor.toLocaleString("pt-BR");
}

function rotular(label: string): string {
  return CANAL_LABEL[label] ?? label;
}

export default function DashboardPage() {
  const [dias, setDias] = React.useState(30);
  const [dados, setDados] = React.useState<Dados | null>(null);
  const [widgets, setWidgets] = React.useState<Widget[] | null>(null);
  const [editando, setEditando] = React.useState(false);
  const [selecionado, setSelecionado] = React.useState<string | null>(null);
  const [adicionando, setAdicionando] = React.useState(false);
  const [construtor, setConstrutor] = React.useState<{ editandoId: string | null } | null>(null);
  const [rotulos, setRotulos] = React.useState<Rotulos>({ campos: [], funis: [] });

  React.useEffect(() => {
    Promise.all([
      fetch("/api/custom-fields?entity=deal&todos=1").then((r) => r.json()).catch(() => ({})),
      fetch("/api/pipelines").then((r) => r.json()).catch(() => ({})),
    ]).then(([c, pp]) => setRotulos({ campos: c.fields ?? [], funis: pp.pipelines ?? [] }));
  }, []);
  const [carregando, setCarregando] = React.useState(true);
  const [estadoSalvar, setEstadoSalvar] = React.useState<"parado" | "salvando" | "salvo">("parado");
  const [atualizadoEm, setAtualizadoEm] = React.useState<string | null>(null);
  const timerSalvar = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const jaCarregou = React.useRef(false);

  const carregarDados = React.useCallback(async () => {
    setCarregando(true);
    try {
      const res = await fetch(`/api/analytics/fontes?dias=${dias}`);
      const d = await res.json();
      if (res.ok) {
        setDados(d);
        setAtualizadoEm(new Date().toLocaleTimeString("pt-BR"));
      }
    } finally {
      setCarregando(false);
    }
  }, [dias]);

  React.useEffect(() => { carregarDados(); }, [carregarDados]);

  React.useEffect(() => {
    fetch("/api/dashboard/layout")
      .then((r) => r.json())
      .then((d) => setWidgets(d.widgets ?? []))
      .catch(() => setWidgets([]));
  }, []);

  // Autosave, igual ao builder: não existe botão Salvar pra lembrar de clicar,
  // e o painel é compartilhado — mudança que fica só na sua tela é pior que
  // mudança nenhuma.
  React.useEffect(() => {
    if (!widgets) return;
    if (!jaCarregou.current) { jaCarregou.current = true; return; }
    setEstadoSalvar("salvando");
    if (timerSalvar.current) clearTimeout(timerSalvar.current);
    timerSalvar.current = setTimeout(async () => {
      await fetch("/api/dashboard/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgets }),
      }).catch(() => {});
      setEstadoSalvar("salvo");
      setTimeout(() => setEstadoSalvar((e) => (e === "salvo" ? "parado" : e)), 1800);
    }, 700);
    return () => { if (timerSalvar.current) clearTimeout(timerSalvar.current); };
  }, [widgets]);

  const catalogo = dados?.catalogo ?? [];
  const fontePorChave = React.useMemo(
    () => new Map(catalogo.map((f) => [f.chave, f])),
    [catalogo]
  );

  function alterar(id: string, mudanca: Partial<Widget>) {
    setWidgets((ws) => (ws ?? []).map((w) => (w.id === id ? { ...w, ...mudanca } : w)));
  }

  function remover(id: string) {
    setWidgets((ws) => (ws ?? []).filter((w) => w.id !== id));
    setSelecionado((s) => (s === id ? null : s));
  }

  function mover(id: string, direcao: -1 | 1) {
    setWidgets((ws) => {
      if (!ws) return ws;
      const i = ws.findIndex((w) => w.id === id);
      const j = i + direcao;
      if (i < 0 || j < 0 || j >= ws.length) return ws;
      const copia = [...ws];
      [copia[i], copia[j]] = [copia[j], copia[i]];
      return copia;
    });
  }

  function adicionar(fonte: Fonte) {
    const id = `w${Date.now().toString(36)}`;
    const tipo = TIPOS_POR_FONTE[fonte.tipo][0];
    setWidgets((ws) => [
      ...(ws ?? []),
      { id, tipo, fonte: fonte.chave, titulo: fonte.rotulo, largura: fonte.tipo === "numero" ? 1 : 2 },
    ]);
    setAdicionando(false);
    setSelecionado(id);
    setEditando(true);
  }

  function salvarDoConstrutor(r: ResultadoDoConstrutor) {
    const alvo = construtor?.editandoId;
    if (alvo) {
      alterar(alvo, { consulta: r.consulta, tipo: r.tipo, titulo: r.titulo });
    } else {
      const id = `w${Date.now().toString(36)}`;
      setWidgets((ws) => [
        ...(ws ?? []),
        { id, tipo: r.tipo, fonte: "custom", titulo: r.titulo, largura: r.tipo === "numero" ? 1 : 2, consulta: r.consulta },
      ]);
      setSelecionado(id);
      setEditando(true);
    }
    setConstrutor(null);
  }

  async function restaurarPadrao() {
    if (!confirm("Voltar ao painel padrão? Os cartões que você montou se perdem.")) return;
    const res = await fetch("/api/dashboard/layout", { method: "DELETE" });
    const d = await res.json();
    jaCarregou.current = false;
    setWidgets(d.widgets ?? []);
    setSelecionado(null);
  }

  const widgetSelecionado = (widgets ?? []).find((w) => w.id === selecionado) ?? null;

  return (
    <div className="flex-1 p-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-primary">Dashboard</h1>
          <p className="mt-1 text-[14px] text-text-secondary">
            {editando
              ? "Clique num cartão pra editar, use o + pra adicionar. Salva sozinho."
              : "O painel da sua operação. Você monta os cartões que quiser."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {estadoSalvar !== "parado" && (
            <span className="text-[12px] text-text-tertiary">
              {estadoSalvar === "salvando" ? "Salvando..." : "Salvo."}
            </span>
          )}
          {!editando && atualizadoEm && (
            <span className="text-[12px] text-text-tertiary">Atualizado: {atualizadoEm}</span>
          )}
          {editando && (
            <button
              type="button"
              onClick={restaurarPadrao}
              title="Voltar ao painel padrão"
              className="inline-flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-2 text-[12.5px] text-text-tertiary transition-colors hover:text-text-primary"
            >
              <RotateCcw size={14} /> Padrão
            </button>
          )}
          <button
            type="button"
            onClick={carregarDados}
            title="Recarregar os números"
            className="inline-flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2 text-[13px] font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            <RefreshCw size={14} className={cn(carregando && "animate-spin")} />
          </button>
          <button
            type="button"
            onClick={() => { setEditando((v) => !v); setSelecionado(null); }}
            className={cn(
              "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-[13px] font-medium transition-colors",
              editando
                ? "bg-ice text-bg-base"
                : "bg-surface-2 text-text-secondary hover:text-text-primary"
            )}
          >
            {editando ? <><Check size={14} /> Concluir</> : <><Pencil size={14} /> Editar painel</>}
          </button>
        </div>
      </header>

      <div className="glass-card mb-4 flex flex-wrap items-center gap-3 rounded-2xl px-4 py-3">
        <span className="text-[12.5px] text-text-tertiary">Período:</span>
        <div className="flex flex-wrap gap-1.5">
          {PERIODOS.map((p) => (
            <button
              key={p.dias}
              type="button"
              onClick={() => setDias(p.dias)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                dias === p.dias
                  ? "bg-ice text-bg-base"
                  : "bg-surface-2 text-text-secondary hover:text-text-primary"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
        <span className="ml-auto text-[11.5px] text-text-tertiary">
          Vale para todos os cartões.
        </span>
      </div>

      <div className={cn("flex gap-4", editando && widgetSelecionado && "items-start")}>
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {(widgets ?? []).map((w, i) => (
            <Cartao
              key={w.id}
              widget={w}
              fonte={fontePorChave.get(w.fonte)}
              dados={dados}
              dias={dias}
              rotulos={rotulos}
              editando={editando}
              selecionado={selecionado === w.id}
              primeiro={i === 0}
              ultimo={i === (widgets ?? []).length - 1}
              onSelecionar={() => setSelecionado(w.id)}
              onRemover={() => remover(w.id)}
              onMover={(d) => mover(w.id, d)}
            />
          ))}

          {editando && (
            <button
              type="button"
              onClick={() => setAdicionando(true)}
              className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-3xl border border-dashed border-border-default text-text-tertiary transition-colors hover:border-accent-500/50 hover:text-accent-400"
            >
              <Plus size={22} />
              <span className="text-[13px] font-medium">Adicionar painel</span>
            </button>
          )}
        </div>

        {editando && widgetSelecionado && (
          <Propriedades
            widget={widgetSelecionado}
            fonte={fontePorChave.get(widgetSelecionado.fonte)}
            catalogo={catalogo}
            onChange={(m) => alterar(widgetSelecionado.id, m)}
            rotulos={rotulos}
            onEditarConsulta={() => setConstrutor({ editandoId: widgetSelecionado.id })}
            onRemover={() => remover(widgetSelecionado.id)}
            onFechar={() => setSelecionado(null)}
          />
        )}
      </div>

      {(widgets ?? []).length === 0 && !editando && (
        <div className="glass-card rounded-3xl px-6 py-16 text-center">
          <LayoutGrid size={30} className="mx-auto mb-4 text-text-tertiary" />
          <h2 className="font-display text-lg font-semibold text-text-primary">Painel vazio</h2>
          <p className="mx-auto mt-2 max-w-sm text-[13.5px] text-text-secondary">
            Entre em &ldquo;Editar painel&rdquo; e adicione o primeiro cartão.
          </p>
        </div>
      )}

      {adicionando && (
        <EscolherFonte
          catalogo={catalogo}
          onEscolher={adicionar}
          onMontar={() => { setAdicionando(false); setConstrutor({ editandoId: null }); }}
          onFechar={() => setAdicionando(false)}
        />
      )}

      {construtor && (
        <ConstrutorDeConsulta
          dias={dias}
          inicial={(() => {
            const w = (widgets ?? []).find((x) => x.id === construtor.editandoId);
            return w?.consulta ? { consulta: w.consulta, tipo: w.tipo, titulo: w.titulo } : undefined;
          })()}
          aoSalvar={salvarDoConstrutor}
          aoFechar={() => setConstrutor(null)}
        />
      )}
    </div>
  );
}

// ── Cartão ─────────────────────────────────────────────────────────────────

function Cartao({
  widget, fonte, dados, dias, rotulos, editando, selecionado, primeiro, ultimo,
  onSelecionar, onRemover, onMover,
}: {
  widget: Widget;
  fonte: Fonte | undefined;
  dados: Dados | null;
  dias: number;
  rotulos: Rotulos;
  editando: boolean;
  selecionado: boolean;
  primeiro: boolean;
  ultimo: boolean;
  onSelecionar: () => void;
  onRemover: () => void;
  onMover: (d: -1 | 1) => void;
}) {
  const span =
    widget.largura === 3 ? "md:col-span-2 xl:col-span-3" : widget.largura === 2 ? "md:col-span-2" : "";

  return (
    <div
      onClick={editando ? onSelecionar : undefined}
      className={cn(
        "glass-card relative flex flex-col rounded-3xl p-5",
        span,
        editando && "cursor-pointer",
        selecionado && "ring-2 ring-accent-500/60"
      )}
    >
      {editando && (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-lg bg-surface-3/90 p-0.5">
          <BotaoMini onClick={(e) => { e.stopPropagation(); onMover(-1); }} disabled={primeiro} titulo="Mover pra trás">
            <ArrowLeft size={12} />
          </BotaoMini>
          <BotaoMini onClick={(e) => { e.stopPropagation(); onMover(1); }} disabled={ultimo} titulo="Mover pra frente">
            <ArrowRight size={12} />
          </BotaoMini>
          <BotaoMini onClick={(e) => { e.stopPropagation(); onRemover(); }} titulo="Remover" perigo>
            <X size={12} />
          </BotaoMini>
        </div>
      )}

      <h2 className="pr-16 text-[12.5px] text-text-tertiary">{widget.titulo}</h2>

      {widget.fonte === "custom" && widget.consulta ? (
        <div className="mt-2 flex-1">
          <ConteudoDeConsulta consulta={widget.consulta} tipo={widget.tipo} dias={dias} />
        </div>
      ) : !fonte ? (
        <p className="mt-3 text-[12.5px] text-text-tertiary">Fonte não encontrada.</p>
      ) : (
        <div className="mt-2 flex-1">
          <Conteudo widget={widget} fonte={fonte} dados={dados} />
        </div>
      )}

      {fonte && !editando && (
        <p className="mt-2 text-[11px] text-text-tertiary">{fonte.explicacao}</p>
      )}
      {widget.fonte === "custom" && widget.consulta && !editando && (
        <p className="mt-2 text-[11px] text-text-tertiary">{descreverConsulta(widget.consulta, rotulos.campos, rotulos.funis)}</p>
      )}
    </div>
  );
}

function BotaoMini({
  children, onClick, disabled, titulo, perigo,
}: {
  children: React.ReactNode;
  onClick: (e: React.MouseEvent) => void;
  disabled?: boolean;
  titulo: string;
  perigo?: boolean;
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-md p-1 text-text-tertiary transition-colors disabled:opacity-30",
        perigo ? "hover:bg-danger/15 hover:text-danger" : "hover:bg-surface-2 hover:text-text-primary"
      )}
    >
      {children}
    </button>
  );
}

function Conteudo({ widget, fonte, dados }: { widget: Widget; fonte: Fonte; dados: Dados | null }) {
  if (!dados) return <p className="text-[12.5px] text-text-tertiary">Carregando...</p>;

  if (widget.tipo === "numero") {
    const valor = dados.numeros[fonte.chave] ?? null;
    return (
      <p className="font-display text-[30px] font-semibold leading-tight text-text-primary tabular-nums">
        {formatar(valor, fonte.formato)}
      </p>
    );
  }

  if (widget.tipo === "linha") {
    const serie = dados.series[fonte.chave] ?? [];
    if (!serie.some((p) => p.value > 0)) return <Vazio />;
    return <AreaChart data={serie} height={190} />;
  }

  if (widget.tipo === "pizza") {
    const quebra = (dados.quebras[fonte.chave] ?? []).filter((p) => p.value > 0);
    if (quebra.length === 0) return <Vazio />;
    return <DonutChart segments={quebra.map((p) => ({ ...p, label: rotular(p.label) }))} size={150} />;
  }

  if (widget.tipo === "barras") {
    const itens = (dados.quebras[fonte.chave] ?? dados.series[fonte.chave] ?? []).filter((p) => p.value > 0);
    if (itens.length === 0) return <Vazio />;
    const maior = Math.max(...itens.map((i) => i.value));
    return (
      <div className="flex flex-col gap-2.5 pt-1">
        {itens.slice(0, 10).map((i) => (
          <div key={i.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-[12.5px]">
              <span className="truncate text-text-secondary">{rotular(i.label)}</span>
              <span className="shrink-0 tabular-nums text-text-tertiary">
                {i.value.toLocaleString("pt-BR")}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-surface-3">
              <div
                className="h-1.5 rounded-full bg-accent-500/70"
                style={{ width: `${Math.max(2, (i.value / maior) * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    );
  }

  const linhas = dados.tabelas[fonte.chave] ?? [];
  if (linhas.length === 0) return <Vazio />;
  return (
    <div className="-mx-2 overflow-x-auto pt-1">
      <table className="w-full min-w-[440px] border-collapse">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-text-tertiary">
            <th className="px-2 pb-2 font-medium">Quando</th>
            <th className="px-2 pb-2 font-medium">Negócio</th>
            <th className="px-2 pb-2 font-medium">Contato</th>
            <th className="px-2 pb-2 text-right font-medium">Valor</th>
          </tr>
        </thead>
        <tbody>
          {linhas.slice(0, 8).map((l) => (
            <tr key={l.id} className="border-t border-border-subtle text-[12.5px]">
              <td className="whitespace-nowrap px-2 py-2 text-text-tertiary">
                {l.quando ? formatRelativeDate(l.quando) : "—"}
              </td>
              <td className="max-w-[170px] truncate px-2 py-2 text-text-primary">{l.titulo}</td>
              <td className="max-w-[130px] truncate px-2 py-2 text-text-secondary">{l.contato}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right font-semibold text-text-primary">
                {(l.valorCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link
        href="/negocios"
        className="mt-3 inline-flex items-center gap-1.5 px-2 text-[12px] font-medium text-accent-400 hover:text-accent-300"
      >
        Abrir o funil <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function Vazio() {
  return (
    <p className="rounded-2xl bg-surface-2 px-4 py-7 text-center text-[12px] text-text-tertiary">
      Sem dados no período.
    </p>
  );
}

// ── Propriedades ───────────────────────────────────────────────────────────

function Propriedades({
  widget, fonte, catalogo, rotulos, onChange, onEditarConsulta, onRemover, onFechar,
}: {
  widget: Widget;
  rotulos: Rotulos;
  fonte: Fonte | undefined;
  catalogo: Fonte[];
  onChange: (m: Partial<Widget>) => void;
  onEditarConsulta: () => void;
  onRemover: () => void;
  onFechar: () => void;
}) {
  const ehCustom = widget.fonte === "custom" && !!widget.consulta;
  const tiposPermitidos = ehCustom
    ? tiposPermitidos_(widget.consulta!)
    : fonte ? TIPOS_POR_FONTE[fonte.tipo] : (["numero"] as Widget["tipo"][]);
  const grupos = [...new Set(catalogo.map((f) => f.grupo))];

  return (
    <aside className="glass-card glass-card-solid sticky top-8 hidden w-[300px] shrink-0 flex-col rounded-3xl lg:flex">
      <header className="flex items-center justify-between border-b border-border-subtle p-4">
        <p className="text-[13px] font-semibold text-text-primary">Propriedades</p>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className="text-text-tertiary transition-colors hover:text-text-primary"
        >
          <X size={15} />
        </button>
      </header>

      <div className="flex flex-col gap-4 p-4">
        <div>
          <Label htmlFor="w-titulo">Título do cartão</Label>
          <Input
            id="w-titulo"
            value={widget.titulo}
            onChange={(e) => onChange({ titulo: e.target.value })}
            placeholder={fonte?.rotulo}
          />
        </div>

        {ehCustom ? (
          <div>
            <Label>O que o cartão mostra</Label>
            <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-[12px] text-text-secondary">{descreverConsulta(widget.consulta!, rotulos.campos, rotulos.funis)}</p>
            <button
              type="button"
              onClick={onEditarConsulta}
              className="mt-2 w-full rounded-xl bg-surface-2 px-3 py-2 text-[12.5px] font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              Editar o que ele mede
            </button>
          </div>
        ) : (
        <div>
          <Label htmlFor="w-fonte">De onde vem o número</Label>
          <Select
            id="w-fonte"
            value={widget.fonte}
            onChange={(e) => {
              const nova = catalogo.find((f) => f.chave === e.target.value);
              if (!nova) return;
              // Trocar a fonte pode invalidar o tipo (pizza não serve pra série).
              // Cair no primeiro tipo compatível evita deixar o cartão num
              // estado que não desenha nada.
              const tipoOk = TIPOS_POR_FONTE[nova.tipo].includes(widget.tipo)
                ? widget.tipo
                : TIPOS_POR_FONTE[nova.tipo][0];
              onChange({ fonte: nova.chave, tipo: tipoOk });
            }}
          >
            {grupos.map((g) => (
              <optgroup key={g} label={g}>
                {catalogo.filter((f) => f.grupo === g).map((f) => (
                  <option key={f.chave} value={f.chave}>{f.rotulo}</option>
                ))}
              </optgroup>
            ))}
          </Select>
          {fonte && <p className="mt-1.5 text-[11.5px] text-text-tertiary">{fonte.explicacao}</p>}
        </div>
        )}

        <div>
          <Label>Como mostrar</Label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {tiposPermitidos.map((t) => {
              const Icone = ICONE_DO_TIPO[t];
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChange({ tipo: t })}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-medium transition-colors",
                    widget.tipo === t
                      ? "bg-accent-soft text-accent-300 ring-1 ring-accent-500/40"
                      : "bg-surface-2 text-text-secondary hover:text-text-primary"
                  )}
                >
                  <Icone size={13} /> {NOME_DO_TIPO[t]}
                </button>
              );
            })}
          </div>
          {tiposPermitidos.length === 1 && (
            <p className="mt-1.5 text-[11.5px] text-text-tertiary">
              Esta fonte só faz sentido assim.
            </p>
          )}
        </div>

        <div>
          <Label>Largura</Label>
          <div className="mt-1 flex gap-1.5">
            {[1, 2, 3].map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => onChange({ largura: l })}
                className={cn(
                  "flex-1 rounded-xl px-3 py-2 text-[12.5px] font-medium transition-colors",
                  widget.largura === l
                    ? "bg-accent-soft text-accent-300 ring-1 ring-accent-500/40"
                    : "bg-surface-2 text-text-secondary hover:text-text-primary"
                )}
              >
                {l === 1 ? "1/3" : l === 2 ? "2/3" : "Cheia"}
              </button>
            ))}
          </div>
        </div>
      </div>

      <footer className="mt-auto border-t border-border-subtle px-4 py-3">
        <button
          type="button"
          onClick={onRemover}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-medium text-text-tertiary transition-colors hover:bg-danger/10 hover:text-danger"
        >
          <X size={13} /> Remover cartão
        </button>
      </footer>
    </aside>
  );
}

// ── Escolher fonte ─────────────────────────────────────────────────────────

function EscolherFonte({
  catalogo, onEscolher, onMontar, onFechar,
}: {
  catalogo: Fonte[];
  onEscolher: (f: Fonte) => void;
  onMontar: () => void;
  onFechar: () => void;
}) {
  const [busca, setBusca] = React.useState("");
  const termo = busca.trim().toLowerCase();
  const filtrado = termo
    ? catalogo.filter((f) => `${f.rotulo} ${f.explicacao}`.toLowerCase().includes(termo))
    : catalogo;
  const grupos = [...new Set(filtrado.map((f) => f.grupo))];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onFechar} />
      <div className="glass-card glass-card-solid relative z-10 flex max-h-[80vh] w-full max-w-[560px] flex-col overflow-hidden rounded-3xl">
        <header className="border-b border-border-subtle p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-[16px] font-semibold text-text-primary">
                O que você quer ver?
              </h2>
              <p className="mt-1 text-[12.5px] text-text-secondary">
                Escolha o número primeiro. O formato do cartão você ajusta depois.
              </p>
            </div>
            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar"
              className="text-text-tertiary transition-colors hover:text-text-primary"
            >
              <X size={16} />
            </button>
          </div>
          <Input
            className="mt-3"
            placeholder="Buscar..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
        </header>

        <div className="flex-1 overflow-y-auto p-3">
          <button
            type="button"
            onClick={onMontar}
            className="mb-2 flex w-full items-start gap-3 rounded-xl bg-accent-soft px-3 py-3 text-left ring-1 ring-accent-500/30 transition-colors hover:ring-accent-500/60"
          >
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent-500/20 text-accent-300">
              <Plus size={14} />
            </span>
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-text-primary">Montar do meu jeito</span>
              <span className="block text-[11.5px] text-text-secondary">
                Some, conte ou tire a média de qualquer valor ou campo seu, separe por etapa, responsável ou mês, e filtre.
              </span>
            </span>
          </button>
          {grupos.length === 0 ? (
            <p className="px-3 py-8 text-center text-[12.5px] text-text-tertiary">
              Nada com “{busca}”.
            </p>
          ) : (
            grupos.map((g) => (
              <div key={g} className="mb-2 last:mb-0">
                <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
                  {g}
                </p>
                <div className="flex flex-col gap-0.5">
                  {filtrado.filter((f) => f.grupo === g).map((f) => {
                    const Icone = ICONE_DO_TIPO[TIPOS_POR_FONTE[f.tipo][0]];
                    return (
                      <button
                        key={f.chave}
                        type="button"
                        onClick={() => onEscolher(f)}
                        className="group flex items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-surface-2"
                      >
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-text-secondary">
                          <Icone size={13} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-[13px] text-text-primary">{f.rotulo}</span>
                          <span className="block text-[11.5px] text-text-tertiary">{f.explicacao}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
