"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { useSearchParams } from "@/lib/contrato/navegacao";
import { nomeDoParametro, parametrosDaTela } from "@/lib/contrato/rotas";
import {
  RefreshCw, Plus, X, ArrowLeft, ArrowRight, Check, ChevronDown, ChevronRight, Ellipsis, ListFilter,
  Hash, LineChart, PieChart, BarChart3, Table2, RotateCcw, Funnel, FilterX,
  Download, FileSpreadsheet, FileText, MoreHorizontal, GripHorizontal, MoveHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { MarcaEva } from "@/components/layout/marca-eva";
import { pulsar } from "@/lib/fundo/eventos";
import { useAuth } from "@/lib/auth/auth-context";
import { dataHoraBR, hojeSP, slugDoArquivo, type Celula } from "@/lib/exportar/csv";
import {
  baixarArquivo,
  csvDeTodosOsCartoes,
  csvDoCartao,
  tabelaDaFonte,
  tabelaDoResultado,
  type SecaoDoCartao,
  type TabelaDoCartao,
} from "@/lib/exportar/cartao";
import { FunnelChart, type EtapaDoFunil } from "@/components/charts/funnel-chart";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { AreaChart } from "@/components/charts/area-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { BarraEmPilha, Porcentagens } from "@/components/charts/proporcao";
import { cn, formatRelativeDate } from "@/lib/utils";
import { ConstrutorDeConsulta, type ResultadoDoConstrutor } from "@/components/dashboard/construtor-de-consulta";
import { ConteudoDeConsulta } from "@/components/dashboard/resultado-de-consulta";
import { ReportBuilder, type ReportCard } from "@/components/reports/report-builder";
import { ReportView, useReportResult } from "@/components/reports/report-view";
import { BASES_COM_FILTROS_DO_PAINEL, DATASET_BY_KEY, formatarDimensao, formatarValor, tipoDoCartao, type ReportQuery, type ReportResult, type VizType } from "@/lib/report-query";
import { useArrastarCartoes } from "@/components/dashboard/arrastar-cartoes";
import { PainelDeFiltros, SeletorDePeriodo, contarFiltros, periodoCurto } from "@/components/dashboard/barra-de-filtros";
import { PainelFiltrarComIa } from "@/components/dashboard/ia-filtrar";
import { VisaoGeral } from "@/components/dashboard/visao-geral";
import { rotulosDasOpcoes, useOpcoesDoDashboard, type OpcoesDoDashboard } from "@/components/dashboard/opcoes";
import {
  ROTULO_CANAL,
  SEM_VALOR,
  descreverConsulta,
  janelaDoPainel,
  diasEntre,
  filtrosGlobaisParaQuery,
  sanearFiltrosGlobais,
  tiposPermitidos as tiposPermitidos_,
  type Consulta,
  type FiltrosGlobais,
  type ResultadoDeConsulta,
  type RotulosDaConsulta,
  type TipoDeCartao,
} from "@/lib/consulta";

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
//
// A barra de filtros do topo (período, funis, responsável) vale pra todos os
// cartões e mora na URL. Fonte que não sabe respeitar um filtro diz isso no
// próprio cartão, em vez de mostrar um número que parece filtrado e não é.
// ---------------------------------------------------------------------------

interface Fonte {
  chave: string;
  rotulo: string;
  explicacao: string;
  tipo: "numero" | "serie" | "quebra" | "tabela" | "funil";
  formato?: "dinheiro" | "inteiro" | "porcento" | "dias";
  grupo: string;
  filtros?: "todos" | "um-funil" | "nenhum";
}

interface Widget {
  id: string;
  tipo: "numero" | "linha" | "pizza" | "barras" | "tabela" | "funil";
  fonte: string;
  titulo: string;
  largura: number;
  /** Só para fonte "custom": o cartão que a pessoa montou. */
  consulta?: Consulta;
  /** Só para fonte "report": o cartão do construtor (v2). */
  relatorio?: { query: ReportQuery; viz: VizType; meta?: number };
}

interface Ponto { label: string; value: number }
interface LinhaTabela {
  id: string; quando: string | null; titulo: string;
  contato: string; responsavel: string; valorCents: number;
  /** Só nas tabelas de funil (negócios parados). */
  etapa?: string;
}

interface Dados {
  catalogo: Fonte[];
  numeros: Record<string, number | null>;
  series: Record<string, Ponto[]>;
  quebras: Record<string, Ponto[]>;
  tabelas: Record<string, LinhaTabela[]>;
  funis: Record<string, EtapaDoFunil[]>;
  historicoDesde: string | null;
  funilDasFontesDeFunil?: { id: string; name: string } | null;
  periodo?: { de: string; ate: string };
}

/** Que cartões cada tipo de fonte aceita. É isto que impede pizza de série. */
const TIPOS_POR_FONTE: Record<Fonte["tipo"], Widget["tipo"][]> = {
  numero: ["numero"],
  serie: ["linha", "barras"],
  quebra: ["pizza", "barras"],
  tabela: ["tabela"],
  funil: ["funil", "barras"],
};

const ICONE_DO_TIPO: Record<Widget["tipo"], React.ComponentType<{ size?: number; className?: string }>> = {
  numero: Hash, linha: LineChart, pizza: PieChart, barras: BarChart3, tabela: Table2, funil: Funnel,
};

const NOME_DO_TIPO: Record<Widget["tipo"], string> = {
  numero: "Número", linha: "Linha", pizza: "Pizza", barras: "Barras", tabela: "Tabela", funil: "Funil",
};

/** O "Painel do funil": monta de uma vez os cartões que respondem como o funil está. */
const PAINEL_DO_FUNIL: { fonte: string; tipo: Widget["tipo"] }[] = [
  { fonte: "taxaDeGanho", tipo: "numero" },
  { fonte: "cicloDeVenda", tipo: "numero" },
  { fonte: "negociosAbertos", tipo: "numero" },
  { fonte: "emAbertoPonderado", tipo: "numero" },
  { fonte: "funilConversao", tipo: "funil" },
  { fonte: "tempoPorEtapa", tipo: "barras" },
  { fonte: "negociosParados", tipo: "tabela" },
  { fonte: "motivosDePerda", tipo: "pizza" },
];

/** Cartão montado pelo construtor nunca é funil; se vier, mostra como barras. */
function tipoDeConsulta(t: Widget["tipo"]): TipoDeCartao {
  return t === "funil" ? "barras" : t;
}

function formatar(valor: number | null, formato: Fonte["formato"]): string {
  if (valor === null || valor === undefined) return "—";
  if (formato === "dinheiro") {
    return (valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (formato === "porcento") return `${(valor * 100).toFixed(1)}%`;
  if (formato === "dias") return `${valor.toLocaleString("pt-BR")} ${valor === 1 ? "dia" : "dias"}`;
  return valor.toLocaleString("pt-BR");
}

function rotular(label: string): string {
  return ROTULO_CANAL[label] ?? label;
}

/** Selo do cartão de fonte fixa quando um filtro do painel não vale pra ela. */
function seloDeFiltro(fonte: Fonte, globais: FiltrosGlobais, dados: Dados | null, totalDeFunis: number): string | null {
  const comFiltro = globais.funis.length > 0 || globais.donos.length > 0;
  if (fonte.filtros === "nenhum") return comFiltro ? "Não usa os filtros de funil e responsável" : null;
  if (fonte.filtros === "um-funil") {
    const nome = dados?.funilDasFontesDeFunil?.name;
    if (globais.funis.length > 1) return `Não soma funis: mostra só ${nome ? `“${nome}”` : "o funil padrão"}`;
    if (globais.funis.length === 0 && totalDeFunis > 1 && nome) return `Funil “${nome}”`;
  }
  return null;
}

// ── Exportação ─────────────────────────────────────────────────────────────

const dataDoDia = (dia: string) => dia.split("-").reverse().join("/");

/** "01/10/2026 a 30/10/2026 (últimos 30 dias)". */
function descreverPeriodo(globais: FiltrosGlobais, dados: Dados | null): string {
  const j = dados?.periodo ?? janelaDoPainel(globais.dias, globais.de, globais.ate);
  const intervalo = `${dataDoDia(j.de)} a ${dataDoDia(j.ate)}`;
  return globais.de && globais.ate ? intervalo : `${intervalo} (últimos ${globais.dias} dias)`;
}

/** Os filtros globais ativos, já com nomes; vazio quando não há nenhum. */
function filtrosEmTexto(globais: FiltrosGlobais, opcoes: OpcoesDoDashboard): [string, string][] {
  const out: [string, string][] = [];
  if (globais.funis.length) {
    out.push(["Funis", globais.funis.map((id) => opcoes.funis.find((f) => f.id === id)?.name ?? "funil removido").join(", ")]);
  }
  if (globais.donos.length) {
    const nomes = globais.donos.map((id) =>
      id === SEM_VALOR ? "sem responsável" : opcoes.membros.find((m) => m.id === id)?.name ?? "pessoa removida"
    );
    out.push(["Responsáveis", nomes.join(", ")]);
  }
  return out;
}

/**
 * Os dados que o cartão desenha, como tabela. Fonte fixa já está em `dados`;
 * cartão montado pede o resultado de novo (o mesmo cálculo que ele mostra).
 */
async function tabelaDoWidget(
  widget: Widget,
  fonte: Fonte | undefined,
  dados: Dados | null,
  globais: FiltrosGlobais
): Promise<{ tabela: TabelaDoCartao | null; erro?: string }> {
  if (widget.fonte === "report" && widget.relatorio) {
    try {
      const res = await fetch("/api/reports/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: widget.relatorio.query, globals: globais }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.result) return { tabela: null, erro: d.error ?? "Não foi possível calcular." };
      return { tabela: tabelaDoRelatorio(d.result as ReportResult) };
    } catch {
      return { tabela: null, erro: "Sem conexão." };
    }
  }
  if (widget.fonte === "custom" && widget.consulta) {
    try {
      const res = await fetch("/api/analytics/consulta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consulta: widget.consulta, ...globais, lista: widget.tipo === "tabela" }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok || !d.resultado) return { tabela: null, erro: d.error ?? "Não foi possível calcular." };
      return { tabela: tabelaDoResultado(d.resultado as ResultadoDeConsulta) };
    } catch {
      return { tabela: null, erro: "Sem conexão." };
    }
  }
  if (!fonte) return { tabela: null, erro: "Fonte não encontrada." };
  if (!dados) return { tabela: null, erro: "Os números ainda não carregaram." };
  return { tabela: tabelaDaFonte(fonte, dados, rotular) };
}

/** Resultado do construtor (v2) como tabela de CSV: número cru, o resto como aparece na tela. */
function tabelaDoRelatorio(r: ReportResult): TabelaDoCartao {
  return {
    cabecalho: r.columns.map((c) => c.label),
    linhas: r.rows.map((l) =>
      r.columns.map((c, i) => {
        const v = l[i];
        if (typeof v === "number") return v;
        if (v === null) return "";
        return c.role === "dimension" ? formatarDimensao(v, c) : formatarValor(v, c.type);
      })
    ),
  };
}

/** Linhas do topo do "Todos os cartões": de quando e com que filtros. */
function linhasDoTopo(globais: FiltrosGlobais, dados: Dados | null, opcoes: OpcoesDoDashboard, organizacao: string): Celula[][] {
  return [
    [`Dashboard${organizacao ? ` · ${organizacao}` : ""}`],
    ["Período", descreverPeriodo(globais, dados)],
    ...filtrosEmTexto(globais, opcoes),
    ["Gerado em", dataHoraBR(new Date())],
  ];
}

// useSearchParams precisa de um Suspense em volta para a página poder ser
// pré-renderizada (sem ele o build falha).
export default function DashboardPage() {
  return (
    <React.Suspense fallback={<div className="flex-1 px-6 pt-1 text-small text-text-tertiary">Carregando…</div>}>
      <Painel />
    </React.Suspense>
  );
}

function Painel() {
  const parametros = useSearchParams();
  const consultaDaUrl = parametros.toString();
  // Na URL os nomes são em inglês (?from=&to=&days=&pipelines=&owners=); os
  // filtros globais e a API continuam com os deles (de, ate, dias, funis, donos).
  const globais = React.useMemo(() => {
    const url = new URLSearchParams(consultaDaUrl);
    const g = new URLSearchParams();
    for (const k of ["dias", "de", "ate", "funis", "donos"]) {
      const v = url.get(nomeDoParametro(k));
      if (v !== null) g.set(k, v);
    }
    return sanearFiltrosGlobais(g);
  }, [consultaDaUrl]);
  const dias = globais.de && globais.ate ? diasEntre(globais.de, globais.ate) : globais.dias;

  // A URL é o estado: replaceState avisa o roteador do Next (useSearchParams
  // acompanha) sem recarregar a página nem empilhar histórico a cada clique.
  const mudarGlobais = React.useCallback((g: FiltrosGlobais) => {
    const q = parametrosDaTela(filtrosGlobaisParaQuery(g));
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  }, []);

  const [dados, setDados] = React.useState<Dados | null>(null);
  const [widgets, setWidgets] = React.useState<Widget[] | null>(null);
  const grade = React.useRef<HTMLDivElement>(null);
  const { arrastando, arrastar, redimensionar } = useArrastarCartoes(grade, widgets, setWidgets);
  const [editando, setEditando] = React.useState(false);
  const [selecionado, setSelecionado] = React.useState<string | null>(null);
  const [adicionando, setAdicionando] = React.useState(false);
  const [construtor, setConstrutor] = React.useState<{ editandoId: string | null } | null>(null);
  const [construtorV2, setConstrutorV2] = React.useState<{ editandoId: string | null } | null>(null);
  const { opcoes } = useOpcoesDoDashboard();
  const rotulos = React.useMemo(() => rotulosDasOpcoes(opcoes), [opcoes]);
  const [carregando, setCarregando] = React.useState(true);
  const [estadoSalvar, setEstadoSalvar] = React.useState<"parado" | "salvando" | "salvo">("parado");
  const [atualizadoEm, setAtualizadoEm] = React.useState<string | null>(null);
  // Momento em que os números chegaram: referência do aviso de histórico (sem
  // ler o relógio durante a renderização).
  const [carregadoEm, setCarregadoEm] = React.useState<number | null>(null);
  const timerSalvar = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const jaCarregou = React.useRef(false);

  const carregarDados = React.useCallback(async () => {
    setCarregando(true);
    try {
      const q = filtrosGlobaisParaQuery(globais);
      const res = await fetch(`/api/analytics/fontes${q ? `?${q}` : ""}`);
      const d = await res.json();
      if (res.ok) {
        setDados(d);
        setAtualizadoEm(new Date().toLocaleTimeString("pt-BR"));
        setCarregadoEm(Date.now());
      }
    } finally {
      setCarregando(false);
    }
  }, [globais]);

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

  // Acrescenta o que falta do Painel do funil, sem duplicar cartão que já existe.
  function montarPainelDoFunil() {
    const base = Date.now().toString(36);
    setWidgets((ws) => {
      const atuais = ws ?? [];
      const novos = PAINEL_DO_FUNIL.filter((p) => fontePorChave.has(p.fonte) && !atuais.some((w) => w.fonte === p.fonte)).map(
        (p, i) => ({
          id: `w${base}${i}`,
          tipo: p.tipo,
          fonte: p.fonte,
          titulo: fontePorChave.get(p.fonte)?.rotulo ?? p.fonte,
          largura: p.tipo === "numero" ? 1 : 2,
        })
      );
      return [...atuais, ...novos];
    });
  }

  const temCartaoDeFunil = (widgets ?? []).some((w) => PAINEL_DO_FUNIL.some((p) => p.fonte === w.fonte && p.tipo !== "numero"));
  const historicoRecente =
    temCartaoDeFunil &&
    carregadoEm !== null &&
    (!dados?.historicoDesde ||
      (dados.periodo
        ? new Date(dados.historicoDesde).toISOString().slice(0, 10) > dados.periodo.de
        : new Date(dados.historicoDesde).getTime() > carregadoEm - dias * 86_400_000));

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

  function salvarDoConstrutorV2(r: ReportCard) {
    const alvo = construtorV2?.editandoId;
    const relatorio = { query: r.query, viz: r.viz, ...(r.meta ? { meta: r.meta } : {}) };
    const tipo = tipoDoCartao(r.viz);
    if (alvo) {
      alterar(alvo, { relatorio, tipo, titulo: r.titulo });
    } else {
      const id = `w${Date.now().toString(36)}`;
      setWidgets((ws) => [...(ws ?? []), { id, tipo, fonte: "report", titulo: r.titulo, largura: tipo === "numero" ? 1 : 2, relatorio }]);
      setSelecionado(id);
      setEditando(true);
    }
    setConstrutorV2(null);
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

  const { session } = useAuth();
  const organizacao = session?.orgName ?? "";
  const [exportando, setExportando] = React.useState(false);
  const filtrosAtivos = filtrosEmTexto(globais, opcoes);

  // PDF = a própria página impressa. Sai do modo de edição antes e espera o
  // menu fechar, para nada disso sair na folha.
  function imprimir() {
    setEditando(false);
    setSelecionado(null);
    setTimeout(() => window.print(), 300);
  }

  async function exportarTodos() {
    setExportando(true);
    try {
      const secoes: SecaoDoCartao[] = [];
      for (const w of widgets ?? []) {
        const r = await tabelaDoWidget(w, fontePorChave.get(w.fonte), dados, globais);
        secoes.push({ titulo: w.titulo || fontePorChave.get(w.fonte)?.rotulo || "Cartão", tabela: r.tabela, erro: r.erro });
      }
      baixarArquivo(csvDeTodosOsCartoes(linhasDoTopo(globais, dados, opcoes, organizacao), secoes), `dashboard-${hojeSP()}.csv`);
    } finally {
      setExportando(false);
    }
  }

  async function exportarCartao(w: Widget) {
    const r = await tabelaDoWidget(w, fontePorChave.get(w.fonte), dados, globais);
    if (!r.tabela) {
      alert(r.erro ?? "Sem dados para exportar.");
      return;
    }
    baixarArquivo(csvDoCartao(r.tabela), `${slugDoArquivo(w.titulo || "cartao")}-${hojeSP()}.csv`);
  }

  // ── Resumo (fora da edição): poucos números grandes, a curva e duas
  // leituras curtas, montados a partir dos cartões do próprio painel, na
  // ordem dele. O resto dos cartões fica em "Ver mais". ──
  const resumo = React.useMemo(() => {
    const ws = widgets ?? [];
    const fixa = (w: Widget) => w.fonte !== "custom" && fontePorChave.has(w.fonte);
    const numeros = ws.filter((w) => w.tipo === "numero" && fixa(w));
    const principal = numeros.find((w) => fontePorChave.get(w.fonte)?.formato === "dinheiro") ?? numeros[0] ?? null;
    const apoio = numeros.filter((w) => w !== principal).slice(0, 2);
    const curva = ws.find((w) => w.tipo === "linha" && fixa(w) && fontePorChave.get(w.fonte)?.tipo === "serie") ?? null;
    const base = ws
      .filter((w) => (w.tipo === "barras" || w.tipo === "pizza") && fixa(w) && fontePorChave.get(w.fonte)?.tipo === "quebra")
      .slice(0, 2);
    const usados = [principal, ...apoio, curva, ...base].filter((w): w is Widget => !!w);
    const ids = new Set(usados.map((w) => w.id));
    return { principal, apoio, curva, base, usados, resto: ws.filter((w) => !ids.has(w.id)) };
  }, [widgets, fontePorChave]);

  const [verResto, setVerResto] = React.useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);
  const [iaAberta, setIaAberta] = React.useState(false);
  const nFiltros = contarFiltros(globais);

  // O número principal mudou numa recarga (entrou venda, mudou filtro): o fundo reage.
  const heroi = React.useRef<HTMLElement | null>(null);
  const valorPrincipal = resumo.principal ? dados?.numeros[resumo.principal.fonte] ?? null : null;
  const valorAnterior = React.useRef<number | null>(null);
  React.useEffect(() => {
    if (valorPrincipal === null) return;
    if (valorAnterior.current !== null && valorAnterior.current !== valorPrincipal) pulsar(heroi.current, 1.6);
    valorAnterior.current = valorPrincipal;
  }, [valorPrincipal]);

  const semCartoes = (widgets ?? []).length === 0;
  const carregandoResumo = !dados && carregando;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 px-4 pb-6 pt-1 lg:px-6 print:p-0">
      {/* Na folha impressa: título, período e filtros no lugar da barra. */}
      <div className="hidden print:block">
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">
          Dashboard{organizacao ? ` · ${organizacao}` : ""}
        </h1>
        <div className="text-caption text-text-secondary">
          <p>Período: {descreverPeriodo(globais, dados)}</p>
          {filtrosAtivos.length > 0 && <p>{filtrosAtivos.map(([r, v]) => `${r}: ${v}`).join(" · ")}</p>}
          {carregadoEm !== null && <p className="text-text-tertiary">Gerado em {dataHoraBR(new Date(carregadoEm))}</p>}
        </div>
      </div>

      {/* Visão geral fixa do mês; o painel montável vem logo abaixo. */}
      {!editando && (
        <div className="flex flex-col gap-4 print:hidden">
          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.03em] text-text-primary">Dashboard</h1>
          <VisaoGeral />
        </div>
      )}

      {/* Barra do painel montável: período em cápsula; à direita Filtros, "…" e Editar painel. */}
      <div className={cn("flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2 print:hidden", !editando && "mt-4 border-t border-border-subtle pt-6")}>
        {editando ? (
          <h1 className="text-heading font-semibold tracking-tight text-text-primary">Seu painel</h1>
        ) : (
          <h2 className="text-heading font-semibold tracking-tight text-text-primary">Seu painel</h2>
        )}
        <span className="font-mono text-caption tabular-nums text-text-tertiary" aria-live="polite">
          {estadoSalvar === "salvando" ? "salvando…" : estadoSalvar === "salvo" ? "salvo" : !editando && atualizadoEm ? `atualizado ${atualizadoEm}` : ""}
        </span>
        <SeletorDePeriodo
          globais={globais}
          aoMudar={mudarGlobais}
          aoPersonalizar={() => setFiltrosAbertos(true)}
          className="order-last w-full sm:order-none sm:ml-2 sm:w-auto"
        />
        <div className="ml-auto flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setFiltrosAbertos((v) => !v)}
            aria-expanded={filtrosAbertos}
            aria-label={nFiltros ? `Filtros, ${nFiltros} ligados` : "Filtros"}
          >
            <ListFilter size={14} aria-hidden="true" />
            Filtros
            {nFiltros > 0 && <span className="font-mono text-caption tabular-nums text-accent-fg">{nFiltros}</span>}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label="Mais: atualizar, painel do funil, filtrar com a Eva, exportar" variant="secondary" disabled={exportando}>
                <Ellipsis className={cn(exportando && "animate-pulse")} />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72">
              <DropdownMenuItem onSelect={() => void carregarDados()}>
                <RefreshCw className={cn(carregando && "animate-spin")} aria-hidden="true" /> Atualizar os números
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setIaAberta(true)}>
                <MarcaEva size={15} className="text-text-tertiary" /> Filtrar com a Eva
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={montarPainelDoFunil} title="Acrescenta os cartões de funil que ainda não estão no painel">
                <Funnel aria-hidden="true" /> Acrescentar o painel do funil
              </DropdownMenuItem>
              {editando && (
                <DropdownMenuItem onSelect={() => void restaurarPadrao()}>
                  <RotateCcw aria-hidden="true" /> Voltar ao painel padrão
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Exportar · no PDF, escolha &ldquo;Salvar como PDF&rdquo;</DropdownMenuLabel>
              <DropdownMenuItem onSelect={imprimir}>
                <FileText aria-hidden="true" /> Relatório (PDF)
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportarTodos()} disabled={!widgets?.length}>
                <FileSpreadsheet aria-hidden="true" /> Todos os cartões (CSV)
              </DropdownMenuItem>
              {/* Os cartões do resumo não têm menu próprio: o CSV de cada um mora aqui. */}
              {!editando &&
                resumo.usados.map((w) => (
                  <DropdownMenuItem key={w.id} onSelect={() => void exportarCartao(w)}>
                    <Download aria-hidden="true" /> {w.titulo || fontePorChave.get(w.fonte)?.rotulo || "Cartão"} (CSV)
                  </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="secondary"
            onClick={() => {
              setEditando((v) => !v);
              setSelecionado(null);
            }}
            className="border-transparent bg-inverse font-semibold text-inverse-fg hover:bg-inverse hover:opacity-90"
          >
            {editando ? (
              <>
                <Check size={14} aria-hidden="true" /> Concluir
              </>
            ) : (
              "Editar painel"
            )}
          </Button>
        </div>
      </div>

      {filtrosAbertos && (
        <div className="rounded-[18px] border border-border-subtle bg-panel p-4 print:hidden">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-body font-semibold text-text-primary">Filtros do painel</h2>
            <IconButton aria-label="Fechar filtros" size="sm" onClick={() => setFiltrosAbertos(false)}>
              <X />
            </IconButton>
          </div>
          <PainelDeFiltros globais={globais} aoMudar={mudarGlobais} opcoes={opcoes} />
        </div>
      )}

      {iaAberta && (
        <div className="rounded-[18px] border border-border-subtle bg-panel p-4 print:hidden">
          <PainelFiltrarComIa
            globais={globais}
            opcoes={opcoes}
            aoMudar={mudarGlobais}
            aoFechar={() => setIaAberta(false)}
            aoSalvarCartao={salvarDoConstrutor}
          />
        </div>
      )}

      {historicoRecente && (
        <p className="rounded-[14px] bg-raised px-4 py-3 text-small leading-relaxed text-text-secondary">
          {dados?.historicoDesde
            ? `O histórico de etapas começou em ${new Date(dados.historicoDesde).toLocaleDateString("pt-BR")}. `
            : "O histórico de etapas começa a ser gravado a partir de agora. "}
          Antes disso, cada negócio conta a partir da etapa em que estava, então conversão e dias por etapa ficam mais
          precisos com o tempo.
        </p>
      )}

      {editando ? (
        <>
          <p className="font-mono text-caption text-text-tertiary print:hidden">Clique num cartão para editar; use o + para adicionar. Salva sozinho.</p>
          <div className={cn("flex gap-4", widgetSelecionado && "items-start")}>
            <div ref={grade} className="dash-grade grid min-w-0 flex-1 grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {(widgets ?? []).map((w, i) => (
                <Cartao
                  key={w.id}
                  widget={w}
                  fonte={fontePorChave.get(w.fonte)}
                  dados={dados}
                  globais={globais}
                  opcoes={opcoes}
                  rotulos={rotulos}
                  editando
                  selecionado={selecionado === w.id}
                  primeiro={i === 0}
                  ultimo={i === (widgets ?? []).length - 1}
                  onSelecionar={() => setSelecionado(w.id)}
                  onRemover={() => remover(w.id)}
                  onMover={(d) => mover(w.id, d)}
                  onBaixarCsv={() => exportarCartao(w)}
                  arrastando={arrastando === w.id}
                  onArrastar={(e) => arrastar(w.id, e)}
                  onRedimensionar={(e) => redimensionar(w.id, e)}
                />
              ))}
              <button
                type="button"
                onClick={() => setAdicionando(true)}
                className="flex min-h-[140px] flex-col items-center justify-center gap-2 rounded-[18px] border border-dashed border-border-default text-text-tertiary transition-colors hover:border-accent-solid/50 hover:text-accent-fg print:hidden"
              >
                <Plus size={20} aria-hidden="true" />
                <span className="text-small font-medium">Adicionar cartão</span>
              </button>
            </div>

            {widgetSelecionado && (
              <Propriedades
                widget={widgetSelecionado}
                fonte={fontePorChave.get(widgetSelecionado.fonte)}
                catalogo={catalogo}
                onChange={(m) => alterar(widgetSelecionado.id, m)}
                rotulos={rotulos}
                onEditarConsulta={() =>
                  widgetSelecionado.fonte === "report"
                    ? setConstrutorV2({ editandoId: widgetSelecionado.id })
                    : setConstrutor({ editandoId: widgetSelecionado.id })
                }
                onRemover={() => remover(widgetSelecionado.id)}
                onFechar={() => setSelecionado(null)}
              />
            )}
          </div>
        </>
      ) : semCartoes && widgets !== null ? (
        <div className="rounded-[18px] border border-border-subtle bg-panel px-5 py-10 text-center">
          <p className="text-body font-medium text-text-primary">Painel vazio.</p>
          <p className="mt-1 text-small text-text-secondary">Entre em &ldquo;Editar painel&rdquo; e adicione o primeiro cartão.</p>
          <Button variant="secondary" className="mt-4" onClick={() => setEditando(true)}>
            Editar painel
          </Button>
        </div>
      ) : carregandoResumo || widgets === null ? (
        <div className="flex flex-col gap-5" aria-busy="true">
          <div className="h-[84px] w-72 max-w-full animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none" />
          <div className="h-[260px] animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none" />
        </div>
      ) : (
        <>
          {(resumo.principal || resumo.apoio.length > 0) && (
            <section ref={heroi} aria-label="Números do período" className="flex flex-wrap items-end gap-x-8 gap-y-4">
              {resumo.principal && (
                <NumeroPrincipal
                  widget={resumo.principal}
                  fonte={fontePorChave.get(resumo.principal.fonte)!}
                  dados={dados}
                  periodo={periodoCurto(globais, dados?.periodo)}
                  selo={seloDeFiltro(fontePorChave.get(resumo.principal.fonte)!, globais, dados, opcoes.funis.length)}
                />
              )}
              {resumo.apoio.length > 0 && (
                <div className="flex flex-wrap gap-x-7 gap-y-3 pb-1.5">
                  {resumo.apoio.map((w) => {
                    const f = fontePorChave.get(w.fonte)!;
                    return (
                      <div key={w.id} className="flex flex-col gap-0.5" title={f.explicacao}>
                        <b className="text-heading font-normal tracking-[-0.03em] tabular-nums text-text-primary">
                          {formatar(dados?.numeros[f.chave] ?? null, f.formato)}
                        </b>
                        <span className="font-mono text-caption text-text-tertiary">{w.titulo || f.rotulo}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          )}

          {resumo.curva && (
            <Curva widget={resumo.curva} fonte={fontePorChave.get(resumo.curva.fonte)!} dados={dados} />
          )}

          {resumo.base.length > 0 && (
            <div className={cn("grid gap-7", resumo.base.length > 1 && "md:grid-cols-[1.4fr_1fr]")}>
              {resumo.base.map((w) => (
                <LeituraCurta key={w.id} widget={w} fonte={fontePorChave.get(w.fonte)!} dados={dados} />
              ))}
            </div>
          )}

          {resumo.resto.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setVerResto((v) => !v)}
                aria-expanded={verResto}
                className="inline-flex w-fit items-center gap-1 text-small font-medium text-accent-fg hover:underline print:hidden"
              >
                {verResto ? "Mostrar menos" : `Ver mais ${resumo.resto.length} ${resumo.resto.length === 1 ? "cartão" : "cartões"}`}
                {verResto ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
              </button>
              {/* Na impressão o painel sai inteiro. */}
              <div className={cn("dash-grade grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3", !verResto && "hidden print:grid")}>
                {resumo.resto.map((w, i) => (
                  <Cartao
                    key={w.id}
                    widget={w}
                    fonte={fontePorChave.get(w.fonte)}
                    dados={dados}
                    globais={globais}
                    opcoes={opcoes}
                    rotulos={rotulos}
                    editando={false}
                    selecionado={false}
                    primeiro={i === 0}
                    ultimo={i === resumo.resto.length - 1}
                    onSelecionar={() => setSelecionado(w.id)}
                    onRemover={() => remover(w.id)}
                    onMover={(d) => mover(w.id, d)}
                    onBaixarCsv={() => exportarCartao(w)}
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}

      {adicionando && (
        <EscolherFonte
          catalogo={catalogo}
          onEscolher={adicionar}
          onMontar={() => { setAdicionando(false); setConstrutorV2({ editandoId: null }); }}
          onFechar={() => setAdicionando(false)}
        />
      )}

      {construtorV2 && (
        <ReportBuilder
          globals={globais}
          inicial={(() => {
            const w = (widgets ?? []).find((x) => x.id === construtorV2.editandoId);
            return w?.relatorio ? { ...w.relatorio, titulo: w.titulo } : undefined;
          })()}
          aoSalvar={salvarDoConstrutorV2}
          aoFechar={() => setConstrutorV2(null)}
        />
      )}

      {construtor && (
        <ConstrutorDeConsulta
          globais={globais}
          opcoes={opcoes}
          inicial={(() => {
            const w = (widgets ?? []).find((x) => x.id === construtor.editandoId);
            return w?.consulta ? { consulta: w.consulta, tipo: tipoDeConsulta(w.tipo), titulo: w.titulo } : undefined;
          })()}
          aoSalvar={salvarDoConstrutor}
          aoFechar={() => setConstrutor(null)}
        />
      )}
    </div>
  );
}

// ── Resumo ─────────────────────────────────────────────────────────────────

/** Fontes cujas séries e quebras vêm em reais (o resto é contagem). */
const EM_REAIS = new Set(["receitaPorDia", "porEtapa"]);

const reaisInteiros = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const reaisCurtos = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

/** O número que conta a história: grande e leve, sem ícone e sem legenda longa. */
function NumeroPrincipal({
  widget, fonte, dados, periodo, selo,
}: {
  widget: Widget;
  fonte: Fonte;
  dados: Dados | null;
  periodo: string;
  selo: string | null;
}) {
  const valor = dados?.numeros[fonte.chave] ?? null;
  const dinheiro = fonte.formato === "dinheiro" && valor !== null;
  return (
    <div className="flex min-w-0 flex-col" title={fonte.explicacao}>
      <span className="font-mono text-caption text-text-tertiary">
        {widget.titulo || fonte.rotulo} · {periodo}
      </span>
      <p className="mt-1.5 text-[44px] font-light leading-none tracking-[-0.05em] tabular-nums text-text-primary sm:text-[64px]">
        {dinheiro ? (
          <>
            <span className="mr-1.5 align-top text-title font-normal tracking-normal text-text-tertiary">R$</span>
            {Math.round(valor / 100).toLocaleString("pt-BR")}
          </>
        ) : (
          formatar(valor, fonte.formato)
        )}
      </p>
      {selo && <span className="mt-2 font-mono text-caption text-text-tertiary">{selo}</span>}
    </div>
  );
}

/** A série do período como curva limpa (média de 3 dias; o dia a dia aparece na dica). */
function Curva({ widget, fonte, dados }: { widget: Widget; fonte: Fonte; dados: Dados | null }) {
  const serie = dados?.series[fonte.chave] ?? [];
  const emReais = EM_REAIS.has(fonte.chave);
  return (
    <section aria-label={widget.titulo || fonte.rotulo} title={fonte.explicacao}>
      <h2 className="mb-2 font-mono text-caption text-text-tertiary">{widget.titulo || fonte.rotulo}</h2>
      {serie.some((p) => p.value > 0) ? (
        <AreaChart data={serie} height={260} suavizar formatarValor={emReais ? reaisInteiros : undefined} />
      ) : (
        <Vazio />
      )}
    </section>
  );
}

/** Quebra em uma leitura: barra única (etapas) ou três porcentagens (canais, motivos). */
function LeituraCurta({ widget, fonte, dados }: { widget: Widget; fonte: Fonte; dados: Dados | null }) {
  const partes = (dados?.quebras[fonte.chave] ?? []).map((p) => ({ ...p, label: rotular(p.label) }));
  const emReais = EM_REAIS.has(fonte.chave);
  const total = partes.reduce((s, p) => s + p.value, 0);
  return (
    <section aria-label={widget.titulo || fonte.rotulo} title={fonte.explicacao} className="min-w-0">
      <h2 className="mb-3 flex items-baseline gap-2 text-small font-medium text-text-secondary">
        {widget.titulo || fonte.rotulo}
        {widget.tipo === "barras" && total > 0 && (
          <span className="ml-auto font-mono text-caption font-normal tabular-nums text-text-tertiary">
            {emReais ? reaisCurtos(total) : total.toLocaleString("pt-BR")} no total
          </span>
        )}
      </h2>
      {total === 0 ? (
        <Vazio />
      ) : widget.tipo === "barras" ? (
        <BarraEmPilha data={partes} formatarValor={emReais ? reaisCurtos : undefined} />
      ) : (
        <Porcentagens data={partes} />
      )}
    </section>
  );
}

// ── Cartão ─────────────────────────────────────────────────────────────────

function Cartao({
  widget, fonte, dados, globais, opcoes, rotulos, editando, selecionado, primeiro, ultimo,
  onSelecionar, onRemover, onMover, onBaixarCsv, arrastando, onArrastar, onRedimensionar,
}: {
  widget: Widget;
  fonte: Fonte | undefined;
  dados: Dados | null;
  globais: FiltrosGlobais;
  opcoes: OpcoesDoDashboard;
  rotulos: RotulosDaConsulta;
  editando: boolean;
  selecionado: boolean;
  primeiro: boolean;
  ultimo: boolean;
  onSelecionar: () => void;
  onRemover: () => void;
  onMover: (d: -1 | 1) => void;
  onBaixarCsv: () => void;
  /** Só no modo de edição: pegar pela alça e soltar em outro cartão; puxar o canto muda a largura. */
  arrastando?: boolean;
  onArrastar?: (e: React.PointerEvent) => void;
  onRedimensionar?: (e: React.PointerEvent) => void;
}) {
  const span =
    widget.largura === 3 ? "md:col-span-2 xl:col-span-3" : widget.largura === 2 ? "md:col-span-2" : "";
  // O que antes era texto embaixo de cada cartão (de onde sai o número) vira a dica do título.
  const explicacao =
    widget.fonte === "report" && widget.relatorio
      ? DATASET_BY_KEY.get(widget.relatorio.query.dataset)?.description
      : widget.fonte === "custom" && widget.consulta ? descreverConsulta(widget.consulta, rotulos) : fonte?.explicacao;
  const selo = editando
    ? null
    : widget.fonte === "report" && widget.relatorio
      ? !BASES_COM_FILTROS_DO_PAINEL.has(widget.relatorio.query.dataset) && (globais.funis.length > 0 || globais.donos.length > 0)
        ? "Não usa os filtros de funil e responsável"
        : null
      : fonte ? seloDeFiltro(fonte, globais, dados, opcoes.funis.length) : null;

  return (
    <div
      data-cartao={widget.id}
      onClick={editando ? onSelecionar : undefined}
      className={cn(
        "relative flex flex-col rounded-[18px] border border-border-subtle bg-panel p-5",
        span,
        widget.largura >= 2 ? "dash-largo" : "dash-estreito",
        editando && "cursor-pointer hover:border-border-default",
        selecionado && "ring-2 ring-accent-solid/60",
        arrastando && "z-20 opacity-70 shadow-overlay"
      )}
    >
      {editando && onArrastar && (
        <button
          type="button"
          aria-label={`Arrastar o cartão ${widget.titulo}`}
          title="Arraste para mudar a ordem"
          onPointerDown={onArrastar}
          onClick={(e) => e.stopPropagation()}
          className="absolute left-1/2 top-1.5 z-10 grid h-4 w-10 -translate-x-1/2 cursor-grab touch-none place-items-center rounded-full text-text-tertiary hover:bg-hover hover:text-text-primary active:cursor-grabbing print:hidden"
        >
          <GripHorizontal size={14} aria-hidden="true" />
        </button>
      )}
      {editando && onRedimensionar && (
        <span
          aria-hidden="true"
          title="Puxe para mudar a largura"
          onPointerDown={onRedimensionar}
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-1 right-1 z-10 hidden size-5 cursor-ew-resize touch-none place-items-center rounded-md text-text-tertiary hover:bg-hover hover:text-text-primary md:grid print:hidden"
        >
          <MoveHorizontal size={12} />
        </span>
      )}
      {editando && (
        <div className="absolute right-3 top-3 z-10 flex items-center gap-0.5 rounded-full border border-border-subtle bg-overlay p-0.5 print:hidden">
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

      {!editando && (
        <div className="absolute right-3 top-3 z-10 print:hidden">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label={`Opções do cartão ${widget.titulo}`} size="sm">
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onBaixarCsv}>
                <Download aria-hidden="true" /> Baixar CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <h2 className="pr-16 text-small font-medium text-text-secondary print:text-text-primary" title={explicacao}>
        {widget.titulo}
      </h2>

      {widget.fonte === "report" && widget.relatorio ? (
        <div className="mt-3 flex min-h-48 flex-1 flex-col">
          <CartaoDeRelatorio relatorio={widget.relatorio} globais={globais} />
        </div>
      ) : widget.fonte === "custom" && widget.consulta ? (
        <div className="mt-3 flex-1">
          <ConteudoDeConsulta consulta={widget.consulta} tipo={tipoDeConsulta(widget.tipo)} globais={globais} />
        </div>
      ) : !fonte ? (
        <p className="mt-3 text-small text-text-tertiary">Fonte não encontrada.</p>
      ) : (
        <div className="mt-3 flex-1">
          <Conteudo widget={widget} fonte={fonte} dados={dados} />
        </div>
      )}

      {selo && (
        <p className="mt-3 inline-flex w-fit items-center gap-1 font-mono text-caption text-text-tertiary">
          <FilterX size={11} aria-hidden="true" /> {selo}
        </p>
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
        perigo ? "hover:bg-danger/15 hover:text-danger" : "hover:bg-hover hover:text-text-primary"
      )}
    >
      {children}
    </button>
  );
}

function CartaoDeRelatorio({ relatorio, globais }: { relatorio: NonNullable<Widget["relatorio"]>; globais: FiltrosGlobais }) {
  const { result, error, loading } = useReportResult(relatorio.query, globais, 0);
  return <ReportView result={result} viz={relatorio.viz} meta={relatorio.meta} loading={loading} error={error} className="flex-1" />;
}

function Conteudo({ widget, fonte, dados }: { widget: Widget; fonte: Fonte; dados: Dados | null }) {
  if (!dados) return <p className="text-small text-text-tertiary">Carregando...</p>;

  if (widget.tipo === "numero") {
    const valor = dados.numeros[fonte.chave] ?? null;
    return (
      <p className="text-display font-light tracking-[-0.04em] text-text-primary tabular-nums">
        {formatar(valor, fonte.formato)}
      </p>
    );
  }

  if (widget.tipo === "linha") {
    const serie = dados.series[fonte.chave] ?? [];
    if (!serie.some((p) => p.value > 0)) return <Vazio />;
    return <AreaChart data={serie} height={190} formatarValor={EM_REAIS.has(fonte.chave) ? reaisInteiros : undefined} />;
  }

  if (widget.tipo === "pizza") {
    const quebra = (dados.quebras[fonte.chave] ?? []).filter((p) => p.value > 0);
    if (quebra.length === 0) return <Vazio />;
    return <DonutChart segments={quebra.map((p) => ({ ...p, label: rotular(p.label) }))} size={150} />;
  }

  if (widget.tipo === "funil") {
    return <FunnelChart etapas={dados.funis?.[fonte.chave] ?? []} />;
  }

  if (widget.tipo === "barras") {
    const funil = dados.funis?.[fonte.chave]?.map((e) => ({ label: e.nome, value: e.quantidade }));
    const itens = (funil ?? dados.quebras[fonte.chave] ?? dados.series[fonte.chave] ?? []).filter((p) => p.value > 0);
    if (itens.length === 0) return <Vazio />;
    const maior = Math.max(...itens.map((i) => i.value));
    return (
      <div className="flex flex-col gap-2.5 pt-1">
        {itens.slice(0, 10).map((i) => (
          <div key={i.label}>
            <div className="mb-1 flex items-center justify-between gap-3 text-small">
              <span className="truncate text-text-secondary">{rotular(i.label)}</span>
              <span className="shrink-0 font-mono text-caption tabular-nums text-text-tertiary">
                {i.value.toLocaleString("pt-BR")}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-hover">
              <div
                className="h-1.5 rounded-full bg-accent-solid"
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
  // Tabela de funil (parados): a coluna do meio é a etapa, e "quando" é desde quando está nela.
  const porEtapa = linhas.some((l) => l.etapa !== undefined);
  return (
    <div className="-mx-2 overflow-x-auto pt-1">
      <table className="w-full min-w-[440px] border-collapse">
        <thead>
          <tr className="text-left font-mono text-caption text-text-tertiary">
            <th className="px-2 pb-2 font-medium">{porEtapa ? "Parado desde" : "Quando"}</th>
            <th className="px-2 pb-2 font-medium">Negócio</th>
            <th className="px-2 pb-2 font-medium">{porEtapa ? "Etapa" : "Contato"}</th>
            <th className="px-2 pb-2 text-right font-medium">Valor</th>
          </tr>
        </thead>
        <tbody>
          {linhas.slice(0, 8).map((l) => (
            <tr key={l.id} className="border-t border-border-subtle text-small">
              <td className="whitespace-nowrap px-2 py-2 text-text-tertiary">
                {l.quando ? formatRelativeDate(l.quando) : "—"}
              </td>
              <td className="max-w-[170px] truncate px-2 py-2 text-text-primary">{l.titulo}</td>
              <td className="max-w-[130px] truncate px-2 py-2 text-text-secondary">{porEtapa ? l.etapa : l.contato}</td>
              <td className="whitespace-nowrap px-2 py-2 text-right font-semibold text-text-primary">
                {(l.valorCents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Link
        href="/deals"
        className="mt-3 inline-flex items-center gap-1.5 px-2 text-small font-medium text-accent-fg hover:underline"
      >
        Abrir o funil <ArrowRight size={12} />
      </Link>
    </div>
  );
}

function Vazio() {
  return (
    <p className="rounded-[14px] bg-raised px-4 py-7 text-center text-small text-text-tertiary">
      Sem dados no período.
    </p>
  );
}

// ── Propriedades ───────────────────────────────────────────────────────────

function Propriedades({
  widget, fonte, catalogo, rotulos, onChange, onEditarConsulta, onRemover, onFechar,
}: {
  widget: Widget;
  rotulos: RotulosDaConsulta;
  fonte: Fonte | undefined;
  catalogo: Fonte[];
  onChange: (m: Partial<Widget>) => void;
  onEditarConsulta: () => void;
  onRemover: () => void;
  onFechar: () => void;
}) {
  const ehCustom = widget.fonte === "custom" && !!widget.consulta;
  const ehRelatorio = widget.fonte === "report" && !!widget.relatorio;
  const tiposPermitidos = ehCustom
    ? tiposPermitidos_(widget.consulta!)
    : fonte ? TIPOS_POR_FONTE[fonte.tipo] : (["numero"] as Widget["tipo"][]);
  const grupos = [...new Set(catalogo.map((f) => f.grupo))];

  return (
    <aside className="border border-border-default bg-overlay shadow-overlay sticky top-8 hidden w-[300px] shrink-0 flex-col rounded-[18px] lg:flex print:hidden">
      <header className="flex items-center justify-between border-b border-border-subtle p-4">
        <p className="text-small font-semibold text-text-primary">Propriedades</p>
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

        {ehRelatorio ? (
          <div>
            <Label>O que o cartão mostra</Label>
            <p className="rounded-[14px] bg-raised px-3 py-2.5 text-caption text-text-secondary">
              Base: {DATASET_BY_KEY.get(widget.relatorio!.query.dataset)?.label}
            </p>
            <button
              type="button"
              onClick={onEditarConsulta}
              className="mt-2 h-8 w-full rounded-full border border-border-subtle bg-raised px-3 text-small font-medium text-text-secondary transition-colors hover:text-text-primary"
            >
              Editar dados e visual
            </button>
          </div>
        ) : ehCustom ? (
          <div>
            <Label>O que o cartão mostra</Label>
            <p className="rounded-[14px] bg-raised px-3 py-2.5 text-caption text-text-secondary">{descreverConsulta(widget.consulta!, rotulos)}</p>
            <button
              type="button"
              onClick={onEditarConsulta}
              className="mt-2 h-8 w-full rounded-full border border-border-subtle bg-raised px-3 text-small font-medium text-text-secondary transition-colors hover:text-text-primary"
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
          {fonte && <p className="mt-1.5 text-caption text-text-tertiary">{fonte.explicacao}</p>}
        </div>
        )}

        {!ehRelatorio && (
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
                    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-small font-medium transition-colors",
                    widget.tipo === t
                      ? "bg-inverse text-inverse-fg"
                      : "border border-border-subtle bg-raised text-text-secondary hover:text-text-primary"
                  )}
                >
                  <Icone size={13} /> {NOME_DO_TIPO[t]}
                </button>
              );
            })}
          </div>
          {tiposPermitidos.length === 1 && (
            <p className="mt-1.5 text-caption text-text-tertiary">
              Esta fonte só faz sentido assim.
            </p>
          )}
        </div>
        )}

        <div>
          <Label>Largura</Label>
          <div className="mt-1 flex gap-1.5">
            {[1, 2, 3].map((l) => (
              <button
                key={l}
                type="button"
                onClick={() => onChange({ largura: l })}
                className={cn(
                  "h-8 flex-1 rounded-full px-3 text-small font-medium transition-colors",
                  widget.largura === l
                    ? "bg-inverse text-inverse-fg"
                    : "border border-border-subtle bg-raised text-text-secondary hover:text-text-primary"
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
          className="flex h-8 w-full items-center justify-center gap-1.5 rounded-full px-3 text-small font-medium text-text-tertiary transition-colors hover:bg-danger/10 hover:text-danger"
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
      <div className="absolute inset-0 bg-backdrop" onClick={onFechar} />
      <div className="border border-border-default bg-overlay shadow-overlay relative z-10 flex max-h-[80vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[18px]">
        <header className="border-b border-border-subtle p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-body-lg font-semibold text-text-primary">
                O que você quer ver?
              </h2>
              <p className="mt-1 text-small text-text-secondary">
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
            className="mb-2 flex w-full items-start gap-3 rounded-[14px] bg-raised px-3 py-3 text-left ring-1 ring-border-subtle transition-colors hover:ring-border-strong"
          >
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-solid text-text-on-accent">
              <Plus size={14} />
            </span>
            <span className="min-w-0">
              <span className="block text-small font-medium text-text-primary">Montar do meu jeito</span>
              <span className="block text-caption text-text-secondary">
                Escolha a base (negócios, tarefas, produtos, conversas, equipe...), filtre, resuma e escolha o visual.
              </span>
            </span>
          </button>
          {grupos.length === 0 ? (
            <p className="px-3 py-8 text-center text-small text-text-tertiary">
              Nada com “{busca}”.
            </p>
          ) : (
            grupos.map((g) => (
              <div key={g} className="mb-2 last:mb-0">
                <p className="px-3 py-1.5 font-mono text-caption text-text-tertiary">
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
                        className="group flex items-start gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors hover:bg-hover"
                      >
                        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] border border-border-subtle bg-raised text-text-secondary">
                          <Icone size={13} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-small text-text-primary">{f.rotulo}</span>
                          <span className="block text-caption text-text-tertiary">{f.explicacao}</span>
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
