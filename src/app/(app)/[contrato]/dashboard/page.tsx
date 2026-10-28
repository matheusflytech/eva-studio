"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { useSearchParams } from "@/lib/contrato/navegacao";
import { nomeDoParametro, parametrosDaTela } from "@/lib/contrato/rotas";
import {
  RefreshCw, Plus, X, ArrowRight, Check, Ellipsis, ListFilter,
  Hash, LineChart, PieChart, BarChart3, Table2, RotateCcw, Funnel,
  FileSpreadsheet, FileText, SlidersHorizontal,
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
import { Input } from "@/components/ui/input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import { MarcaEva } from "@/components/layout/marca-eva";
import { useAuth } from "@/lib/auth/auth-context";
import { permite } from "@/lib/permissoes/catalogo";
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
import { AreaChart } from "@/components/charts/area-chart";
import { DonutChart } from "@/components/charts/donut-chart";
import { cn, formatRelativeDate } from "@/lib/utils";
import { ConstrutorDeConsulta, type ResultadoDoConstrutor } from "@/components/dashboard/construtor-de-consulta";
import { ConteudoDeConsulta } from "@/components/dashboard/resultado-de-consulta";
import { ReportBuilder, type ReportCard } from "@/components/reports/report-builder";
import { ReportView, useReportResult } from "@/components/reports/report-view";
import { BASES_COM_FILTROS_DO_PAINEL, DATASET_BY_KEY, formatarDimensao, formatarValor, tipoDoCartao, type ReportQuery, type ReportResult, type VizType } from "@/lib/report-query";
import { moverComTeclado, useArrastarCartoes, ALTURA_MAXIMA } from "@/components/dashboard/arrastar-cartoes";
import { AdicionarCartao, Cartao } from "@/components/dashboard/cartao";
import { ConteudoDaVisao, NumeroGrande, ROTULO_DO_GRUPO, tabelaDaVisao, type Visao } from "@/components/dashboard/cartoes-da-visao";
import { PainelDeFiltros, SeletorDePeriodo, contarFiltros } from "@/components/dashboard/barra-de-filtros";
import { PainelFiltrarComIa } from "@/components/dashboard/ia-filtrar";
import { rotulosDasOpcoes, useOpcoesDoDashboard, type OpcoesDoDashboard } from "@/components/dashboard/opcoes";
import { alturaPadrao, encaixeDenso } from "@/lib/dashboard-layout";
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
  type FiltroDeConsulta,
  type FiltrosGlobais,
  type ResultadoDeConsulta,
  type TipoDeCartao,
} from "@/lib/consulta";

// ---------------------------------------------------------------------------
// Dashboard: um painel só, montado pela própria pessoa.
//
// Os cartões não são fixos. Você escolhe a fonte (de onde o número sai), o
// visual que ela aceita e o nome. Os blocos da antiga visão geral (Receita,
// Vendas, Ritmo, Mapa de horários...) são cartões como os outros.
//
// Duas decisões que sustentam o resto:
//
// 1. Escolher a FONTE vem antes de escolher o visual, e cada fonte diz em uma
//    linha de onde o número sai. Quem monta painel está escolhendo um número,
//    não um campo de banco.
// 2. Visual incompatível com a fonte nem aparece. Pizza de série temporal não
//    é um erro pra avisar depois: é uma opção que não deveria existir.
//
// Não há modo de edição: quem pode salvar o painel mexe direto nos cartões
// (arrasta, redimensiona, menu ⋯) e o painel salva sozinho, com Desfazer.
// A barra do topo (período, canal, funis, responsável) vale pra todos os
// cartões e mora na URL. Fonte que não sabe respeitar um filtro diz isso no
// próprio cartão, em vez de mostrar um número que parece filtrado e não é.
// ---------------------------------------------------------------------------

interface Fonte {
  chave: string;
  rotulo: string;
  explicacao: string;
  tipo: "numero" | "serie" | "quebra" | "tabela" | "funil" | "especial";
  formato?: "dinheiro" | "inteiro" | "porcento" | "dias";
  grupo: string;
  filtros?: "todos" | "um-funil" | "nenhum";
}

interface Widget {
  id: string;
  tipo: "numero" | "linha" | "pizza" | "barras" | "tabela" | "funil" | "especial";
  fonte: string;
  titulo: string;
  /** Colunas (1–4). */
  largura: number;
  /** Linhas (1–3). */
  altura?: number;
  /** Fundo escuro. */
  destaque?: boolean;
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

type Tipo = Widget["tipo"];

/** Que cartões cada tipo de fonte aceita. É isto que impede pizza de série. */
const TIPOS_POR_FONTE: Record<Fonte["tipo"], Tipo[]> = {
  numero: ["numero"],
  serie: ["linha", "barras"],
  quebra: ["pizza", "barras"],
  tabela: ["tabela"],
  funil: ["funil", "barras"],
  especial: ["especial"],
};

const ICONE_DO_TIPO: Record<Tipo, React.ComponentType<{ size?: number; className?: string }>> = {
  numero: Hash, linha: LineChart, pizza: PieChart, barras: BarChart3, tabela: Table2, funil: Funnel, especial: SlidersHorizontal,
};

const NOME_DO_TIPO: Record<Tipo, string> = {
  numero: "Número", linha: "Linha", pizza: "Pizza", barras: "Barras", tabela: "Tabela", funil: "Funil", especial: "Próprio",
};

/** O "Painel do funil": monta de uma vez os cartões que respondem como o funil está. */
const PAINEL_DO_FUNIL: { fonte: string; tipo: Tipo }[] = [
  { fonte: "taxaDeGanho", tipo: "numero" },
  { fonte: "cicloDeVenda", tipo: "numero" },
  { fonte: "negociosAbertos", tipo: "numero" },
  { fonte: "emAbertoPonderado", tipo: "numero" },
  { fonte: "funilConversao", tipo: "funil" },
  { fonte: "tempoPorEtapa", tipo: "barras" },
  { fonte: "negociosParados", tipo: "tabela" },
  { fonte: "motivosDePerda", tipo: "pizza" },
];

/** Filtro avançado da lista de negócios: só os que estão numa etapa de ganho. */
const SO_GANHOS: { logica: "e"; grupos: { logica: "e"; condicoes: FiltroDeConsulta[] }[] } = {
  logica: "e",
  grupos: [{ logica: "e", condicoes: [{ campo: "tipoEtapa", op: "qualquer", valores: ["won"] }] }],
};

/** Para onde o clique no cartão leva. */
function detalheDoCartao(fonte: string, periodo: { de: string; ate: string }): string | undefined {
  if (["visaoReceita", "visaoVendas", "receita", "vendas"].includes(fonte)) {
    return `/deals?closed=${periodo.de}~${periodo.ate}&av=${encodeURIComponent(JSON.stringify(SO_GANHOS))}`;
  }
  if (["visaoConversas", "conversas"].includes(fonte)) return "/conversations";
  return undefined;
}

/** Cartão montado pelo construtor nunca é funil; se vier, mostra como barras. */
function tipoDeConsulta(t: Tipo): TipoDeCartao {
  return t === "funil" || t === "especial" ? "barras" : t;
}

function formatar(valor: number | null, formato: Fonte["formato"]): string {
  if (valor === null || valor === undefined) return "—";
  if (formato === "dinheiro") {
    return (valor / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
  }
  if (formato === "porcento") return `${(valor * 100).toFixed(1)}%`;
  if (formato === "dias") {
    const n = Math.round(valor);
    return `${n.toLocaleString("pt-BR")} ${n === 1 ? "dia" : "dias"}`;
  }
  return Math.round(valor).toLocaleString("pt-BR");
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
function filtrosEmTexto(globais: FiltrosGlobais, opcoes: OpcoesDoDashboard, canal: string): [string, string][] {
  const out: [string, string][] = [];
  if (canal) out.push(["Canal", ROTULO_DO_GRUPO[canal] ?? canal]);
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
 * Os dados que o cartão desenha, como tabela. Fonte fixa já está em `dados`
 * (ou em `visao`); cartão montado pede o resultado de novo (o mesmo cálculo
 * que ele mostra).
 */
async function tabelaDoWidget(
  widget: Widget,
  fonte: Fonte | undefined,
  dados: Dados | null,
  visao: Visao | null,
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
  const { tipo } = fonte;
  if (tipo === "especial") {
    return visao ? { tabela: tabelaDaVisao(fonte.chave, visao) } : { tabela: null, erro: "Os números ainda não carregaram." };
  }
  if (!dados) return { tabela: null, erro: "Os números ainda não carregaram." };
  return { tabela: tabelaDaFonte({ ...fonte, tipo }, dados, rotular) };
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
function linhasDoTopo(globais: FiltrosGlobais, dados: Dados | null, filtros: [string, string][], organizacao: string): Celula[][] {
  return [
    [`Dashboard${organizacao ? ` · ${organizacao}` : ""}`],
    ["Período", descreverPeriodo(globais, dados)],
    ...filtros,
    ["Gerado em", dataHoraBR(new Date())],
  ];
}

/** Largura da tela a partir da qual dá para editar (tablet para cima). */
function useTelaLarga(): boolean {
  const [larga, setLarga] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const ver = () => setLarga(mq.matches);
    ver();
    mq.addEventListener("change", ver);
    return () => mq.removeEventListener("change", ver);
  }, []);
  return larga;
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
  // Na URL os nomes são em inglês (?from=&to=&days=&pipelines=&owners=&channel=);
  // os filtros globais e a API continuam com os deles (de, ate, dias, funis, donos).
  const globais = React.useMemo(() => {
    const url = new URLSearchParams(consultaDaUrl);
    const g = new URLSearchParams();
    for (const k of ["dias", "de", "ate", "funis", "donos"]) {
      const v = url.get(nomeDoParametro(k));
      if (v !== null) g.set(k, v);
    }
    return sanearFiltrosGlobais(g);
  }, [consultaDaUrl]);
  const canal = React.useMemo(() => new URLSearchParams(consultaDaUrl).get("channel") ?? "", [consultaDaUrl]);
  const dias = globais.de && globais.ate ? diasEntre(globais.de, globais.ate) : globais.dias;

  // A URL é o estado: replaceState avisa o roteador do Next (useSearchParams
  // acompanha) sem recarregar a página nem empilhar histórico a cada clique.
  const gravarUrl = React.useCallback((g: FiltrosGlobais, c: string) => {
    const p = new URLSearchParams(parametrosDaTela(filtrosGlobaisParaQuery(g)));
    if (c) p.set("channel", c);
    const q = p.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  }, []);
  const mudarGlobais = React.useCallback((g: FiltrosGlobais) => gravarUrl(g, canal), [gravarUrl, canal]);
  const mudarCanal = (c: string) => gravarUrl(globais, c);

  const { session } = useAuth();
  const organizacao = session?.orgName ?? "";
  const telaLarga = useTelaLarga();
  // O mesmo que o PUT do layout exige; no celular o painel é só leitura.
  const podeEditar = telaLarga && (!!session?.superadmin || permite(session?.permissoes ?? [], "agents:manage"));
  const avisar = useToast();

  const [dados, setDados] = React.useState<Dados | null>(null);
  const [visao, setVisao] = React.useState<Visao | null>(null);
  const [erroDados, setErroDados] = React.useState<string | null>(null);
  const [erroVisao, setErroVisao] = React.useState<string | null>(null);
  const [widgets, setWidgets] = React.useState<Widget[] | null>(null);
  const [adicionando, setAdicionando] = React.useState(false);
  const [construtor, setConstrutor] = React.useState<{ editandoId: string | null } | null>(null);
  const [construtorV2, setConstrutorV2] = React.useState<{ editandoId: string | null } | null>(null);
  const { opcoes } = useOpcoesDoDashboard();
  const rotulos = React.useMemo(() => rotulosDasOpcoes(opcoes), [opcoes]);
  const [carregando, setCarregando] = React.useState(true);
  const [estadoSalvar, setEstadoSalvar] = React.useState<"parado" | "salvando" | "salvo">("parado");
  const [anuncio, setAnuncio] = React.useState("");
  // Momento em que os números chegaram: referência do aviso de histórico (sem
  // ler o relógio durante a renderização).
  const [carregadoEm, setCarregadoEm] = React.useState<number | null>(null);

  const grade = React.useRef<HTMLDivElement>(null);
  const avisarDesfazer = React.useRef<(antes: Widget[], titulo: string) => void>(() => {});
  const { arrastando, arrastar, redimensionar, animar } = useArrastarCartoes(grade, widgets, setWidgets, (antes, o) =>
    avisarDesfazer.current(antes, o === "movido" ? "Cartão movido" : "Tamanho do cartão alterado")
  );

  const carregarDados = React.useCallback(async () => {
    setCarregando(true);
    const q = filtrosGlobaisParaQuery(globais);
    const daVisao = new URLSearchParams(q);
    if (canal) daVisao.set("channel", canal);
    await Promise.all([
      fetch(`/api/analytics/fontes${q ? `?${q}` : ""}`)
        .then(async (res) => {
          const d = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(d.error ?? "Não foi possível carregar os números.");
          setDados(d);
          setErroDados(null);
          setCarregadoEm(Date.now());
        })
        .catch((e: Error) => setErroDados(e.message || "Sem conexão.")),
      fetch(`/api/dashboard/overview?${daVisao}`)
        .then(async (res) => {
          if (!res.ok) throw new Error("Não foi possível carregar este cartão.");
          setVisao(await res.json());
          setErroVisao(null);
        })
        .catch((e: Error) => setErroVisao(e.message || "Sem conexão.")),
    ]);
    setCarregando(false);
  }, [globais, canal]);

  React.useEffect(() => { void carregarDados(); }, [carregarDados]);

  // ── Layout: carrega, salva sozinho, volta se falhar ──
  const ultimoSalvo = React.useRef<Widget[] | null>(null);
  const pularSalvar = React.useRef(true);
  const timerSalvar = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(() => {
    fetch("/api/dashboard/layout")
      .then((r) => r.json())
      .then((d) => {
        pularSalvar.current = true;
        ultimoSalvo.current = d.widgets ?? [];
        setWidgets(d.widgets ?? []);
      })
      .catch(() => setWidgets([]));
  }, []);

  React.useEffect(() => {
    if (!widgets) return;
    if (pularSalvar.current) { pularSalvar.current = false; return; }
    if (timerSalvar.current) clearTimeout(timerSalvar.current);
    timerSalvar.current = setTimeout(async () => {
      setEstadoSalvar("salvando");
      const ok = await fetch("/api/dashboard/layout", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgets }),
      })
        .then((r) => r.ok)
        .catch(() => false);
      if (ok) {
        ultimoSalvo.current = widgets;
        setEstadoSalvar("salvo");
        setTimeout(() => setEstadoSalvar((e) => (e === "salvo" ? "parado" : e)), 1800);
        return;
      }
      // O painel é compartilhado: mudança que fica só na sua tela é pior que
      // mudança nenhuma. Volta ao que está salvo e avisa.
      setEstadoSalvar("parado");
      pularSalvar.current = true;
      setWidgets(ultimoSalvo.current);
      avisar({ title: "Não foi possível salvar o painel", description: "A grade voltou ao último estado salvo.", tone: "danger" });
    }, 700);
    return () => { if (timerSalvar.current) clearTimeout(timerSalvar.current); };
  }, [widgets, avisar]);

  React.useEffect(() => {
    avisarDesfazer.current = (antes, titulo) =>
      avisar({ title: titulo, action: { label: "Desfazer", onClick: () => animar(() => setWidgets(antes)) }, durationMs: 6000 });
  });

  /** Muda o layout com animação e oferece Desfazer. */
  function mudarLayout(titulo: string, mudar: (ws: Widget[]) => Widget[]) {
    const antes = widgets;
    if (!antes) return;
    animar(() => setWidgets(mudar(antes)));
    avisarDesfazer.current(antes, titulo);
  }

  const catalogo = React.useMemo(() => dados?.catalogo ?? [], [dados]);
  const fontePorChave = React.useMemo(() => new Map(catalogo.map((f) => [f.chave, f])), [catalogo]);

  function alterar(id: string, mudanca: Partial<Widget>, titulo = "Cartão alterado") {
    mudarLayout(titulo, (ws) => ws.map((w) => (w.id === id ? { ...w, ...mudanca } : w)));
  }

  const novoId = () => `w${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;

  function novoWidget(w: Omit<Widget, "id" | "largura" | "altura">): Widget {
    return { ...w, id: novoId(), largura: w.tipo === "numero" ? 1 : 2, altura: alturaPadrao(w.tipo, w.fonte) };
  }

  function adicionar(fonte: Fonte) {
    const tipo = TIPOS_POR_FONTE[fonte.tipo][0];
    mudarLayout("Cartão adicionado", (ws) => [...ws, novoWidget({ tipo, fonte: fonte.chave, titulo: fonte.rotulo })]);
    setAdicionando(false);
  }

  // Acrescenta o que falta do Painel do funil, sem duplicar cartão que já existe.
  function montarPainelDoFunil() {
    mudarLayout("Painel do funil acrescentado", (atuais) => [
      ...atuais,
      ...PAINEL_DO_FUNIL.filter((p) => fontePorChave.has(p.fonte) && !atuais.some((w) => w.fonte === p.fonte)).map((p) =>
        novoWidget({ tipo: p.tipo, fonte: p.fonte, titulo: fontePorChave.get(p.fonte)?.rotulo ?? p.fonte })
      ),
    ]);
  }

  function teclado(id: string, e: React.KeyboardEvent) {
    if (!widgets || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const w = widgets.find((x) => x.id === id);
    if (!w) return;
    let lista = widgets;
    if (e.shiftKey) {
      const largura = Math.min(4, Math.max(1, w.largura + (e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0)));
      const altura = Math.min(ALTURA_MAXIMA, Math.max(1, (w.altura ?? 1) + (e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0)));
      lista = widgets.map((x) => (x.id === id ? { ...x, largura, altura } : x));
      setAnuncio(`${w.titulo}: ${largura} ${largura === 1 ? "coluna" : "colunas"} por ${altura} ${altura === 1 ? "linha" : "linhas"}`);
    } else {
      lista = moverComTeclado(widgets, id, e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1);
      const colunas = grade.current ? getComputedStyle(grade.current).gridTemplateColumns.split(" ").filter(Boolean).length : 4;
      const i = lista.findIndex((x) => x.id === id);
      const lugar = encaixeDenso(lista.map((x) => ({ largura: x.largura, altura: x.altura ?? 1 })), colunas)[i];
      setAnuncio(`${w.titulo}: posição ${i + 1} de ${lista.length}, linha ${lugar.linha + 1}, coluna ${lugar.coluna + 1}`);
    }
    if (lista !== widgets) animar(() => setWidgets(lista));
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
    if (alvo) alterar(alvo, { consulta: r.consulta, tipo: r.tipo, titulo: r.titulo });
    else mudarLayout("Cartão adicionado", (ws) => [...ws, novoWidget({ tipo: r.tipo, fonte: "custom", titulo: r.titulo, consulta: r.consulta })]);
    setConstrutor(null);
  }

  function salvarDoConstrutorV2(r: ReportCard) {
    const alvo = construtorV2?.editandoId;
    const relatorio = { query: r.query, viz: r.viz, ...(r.meta ? { meta: r.meta } : {}) };
    const tipo = tipoDoCartao(r.viz);
    if (alvo) alterar(alvo, { relatorio, tipo, titulo: r.titulo });
    else mudarLayout("Cartão adicionado", (ws) => [...ws, novoWidget({ tipo, fonte: "report", titulo: r.titulo, relatorio })]);
    setConstrutorV2(null);
  }

  async function restaurarPadrao() {
    if (!confirm("Voltar ao painel padrão? Os cartões que você montou se perdem.")) return;
    const res = await fetch("/api/dashboard/layout", { method: "DELETE" });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      avisar({ title: "Não foi possível voltar ao painel padrão", tone: "danger" });
      return;
    }
    pularSalvar.current = true;
    ultimoSalvo.current = d.widgets ?? [];
    animar(() => setWidgets(d.widgets ?? []));
  }

  const [exportando, setExportando] = React.useState(false);
  const filtrosAtivos = filtrosEmTexto(globais, opcoes, canal);

  // PDF = a própria página impressa; espera o menu fechar para ele não sair na folha.
  function imprimir() {
    setTimeout(() => window.print(), 300);
  }

  async function exportarTodos() {
    setExportando(true);
    try {
      const secoes: SecaoDoCartao[] = [];
      for (const w of widgets ?? []) {
        const r = await tabelaDoWidget(w, fontePorChave.get(w.fonte), dados, visao, globais);
        secoes.push({ titulo: w.titulo || fontePorChave.get(w.fonte)?.rotulo || "Cartão", tabela: r.tabela, erro: r.erro });
      }
      baixarArquivo(csvDeTodosOsCartoes(linhasDoTopo(globais, dados, filtrosAtivos, organizacao), secoes), `dashboard-${hojeSP()}.csv`);
    } finally {
      setExportando(false);
    }
  }

  async function exportarCartao(w: Widget) {
    const r = await tabelaDoWidget(w, fontePorChave.get(w.fonte), dados, visao, globais);
    if (!r.tabela) {
      avisar({ title: r.erro ?? "Sem dados para exportar.", tone: "danger" });
      return;
    }
    baixarArquivo(csvDoCartao(r.tabela), `${slugDoArquivo(w.titulo || "cartao")}-${hojeSP()}.csv`);
  }

  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);
  const [iaAberta, setIaAberta] = React.useState(false);
  const nFiltros = contarFiltros(globais);
  const periodo = dados?.periodo ?? visao?.periodo ?? janelaDoPainel(globais.dias, globais.de, globais.ate);
  const canaisComDados = visao?.canaisComDados ?? [];

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

      <div className="flex flex-col gap-3 print:hidden">
        <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-[28px] font-semibold leading-tight tracking-[-0.03em] text-text-primary">Dashboard</h1>
          {visao && (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border-subtle bg-panel px-3 py-1 text-small tabular-nums text-text-secondary">
              <span className={cn("size-2 rounded-full", visao.aoVivo > 0 ? "bg-success" : "bg-text-tertiary/50")} aria-hidden="true" />
              {visao.aoVivo} {visao.aoVivo === 1 ? "conversa agora" : "conversas agora"}
            </span>
          )}
          <span className="text-caption tabular-nums text-text-tertiary" aria-live="polite">
            {estadoSalvar === "salvando" ? "Salvando…" : estadoSalvar === "salvo" ? "Salvo" : ""}
          </span>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setFiltrosAbertos((v) => !v)}
              aria-expanded={filtrosAbertos}
              aria-label={nFiltros ? `Filtros, ${nFiltros} ligados` : "Filtros"}
            >
              <ListFilter size={14} aria-hidden="true" />
              Filtros
              {nFiltros > 0 && <span className="text-caption font-semibold tabular-nums text-accent-fg">{nFiltros}</span>}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <IconButton aria-label="Mais: atualizar, filtrar com a Eva, painel do funil, exportar" variant="secondary" disabled={exportando}>
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
                {podeEditar && (
                  <>
                    <DropdownMenuItem onSelect={montarPainelDoFunil} title="Acrescenta os cartões de funil que ainda não estão no painel">
                      <Funnel aria-hidden="true" /> Acrescentar o painel do funil
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => void restaurarPadrao()}>
                      <RotateCcw aria-hidden="true" /> Voltar ao painel padrão
                    </DropdownMenuItem>
                  </>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Exportar · no PDF, escolha &ldquo;Salvar como PDF&rdquo;</DropdownMenuLabel>
                <DropdownMenuItem onSelect={imprimir}>
                  <FileText aria-hidden="true" /> Relatório (PDF)
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => void exportarTodos()} disabled={!widgets?.length}>
                  <FileSpreadsheet aria-hidden="true" /> Todos os cartões (CSV)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Um período e uma barra de filtros para o painel inteiro. Os trilhos rolam dentro de si no celular. */}
        <div className="flex flex-wrap items-center gap-2">
          <SeletorDePeriodo globais={globais} aoMudar={mudarGlobais} aoPersonalizar={() => setFiltrosAbertos(true)} />
          {canaisComDados.length > 0 && (
            <div className="max-w-full overflow-x-auto [scrollbar-width:none]">
              <SegmentedControl
                label="Canal"
                value={canal}
                onChange={mudarCanal}
                options={[{ value: "", label: "Todos os canais" }, ...canaisComDados.map((g) => ({ value: g, label: ROTULO_DO_GRUPO[g] ?? g }))]}
                className="shrink-0"
              />
            </div>
          )}
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

      <p className="sr-only" aria-live="polite">{anuncio}</p>

      {widgets === null ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4" aria-busy="true">
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-[168px] animate-pulse rounded-[22px] bg-raised motion-reduce:animate-none" />)}
        </div>
      ) : widgets.length === 0 && !podeEditar ? (
        <div className="rounded-[22px] border border-border-subtle bg-panel px-5 py-10 text-center">
          <p className="text-body font-medium text-text-primary">Painel vazio.</p>
          <p className="mt-1 text-small text-text-secondary">Quem configura a conta pode adicionar cartões.</p>
        </div>
      ) : (
        <div ref={grade} className="dash-grade grid grid-flow-row-dense grid-cols-1 gap-4 md:auto-rows-[168px] md:grid-cols-2 xl:grid-cols-4">
          {widgets.map((w, i) => {
            const fonte = fontePorChave.get(w.fonte);
            const especial = w.tipo === "especial";
            const altura = w.altura ?? 1;
            const destaque = !!w.destaque;
            const explicacao =
              w.fonte === "report" && w.relatorio
                ? DATASET_BY_KEY.get(w.relatorio.query.dataset)?.description
                : w.fonte === "custom" && w.consulta ? descreverConsulta(w.consulta, rotulos) : fonte?.explicacao;
            const seloFiltro =
              w.fonte === "report" && w.relatorio
                ? !BASES_COM_FILTROS_DO_PAINEL.has(w.relatorio.query.dataset) && (globais.funis.length > 0 || globais.donos.length > 0)
                  ? "Não usa os filtros de funil e responsável"
                  : null
                : fonte ? seloDeFiltro(fonte, globais, dados, opcoes.funis.length) : null;
            const selo = [seloFiltro, canal && !especial ? "Não usa o filtro de canal" : null].filter(Boolean).join(" · ") || null;
            const erro = especial ? (!visao ? erroVisao : null) : w.fonte === "custom" || w.fonte === "report" ? null : !dados ? erroDados : !fonte ? "Fonte não encontrada." : null;
            return (
              <Cartao
                key={w.id}
                id={w.id}
                titulo={w.titulo || fonte?.rotulo || "Cartão"}
                explicacao={explicacao}
                largura={w.largura}
                altura={altura}
                destaque={destaque}
                indice={i}
                podeEditar={podeEditar}
                arrastando={arrastando === w.id}
                href={detalheDoCartao(w.fonte, periodo)}
                aoAbrir={podeEditar && w.fonte === "report" ? () => setConstrutorV2({ editandoId: w.id }) : undefined}
                selo={selo}
                erro={erro}
                visuais={
                  <Visuais
                    widget={w}
                    fonte={fonte}
                    aoTrocar={(tipo) => alterar(w.id, { tipo }, "Visual trocado")}
                    aoEditarConsulta={() => (w.fonte === "report" ? setConstrutorV2({ editandoId: w.id }) : setConstrutor({ editandoId: w.id }))}
                  />
                }
                aoRenomear={(titulo) => alterar(w.id, { titulo }, "Cartão renomeado")}
                aoDuplicar={() =>
                  mudarLayout("Cartão duplicado", (ws) => {
                    const j = ws.findIndex((x) => x.id === w.id);
                    return [...ws.slice(0, j + 1), { ...w, id: novoId() }, ...ws.slice(j + 1)];
                  })
                }
                aoDestaque={() => alterar(w.id, { destaque: !destaque }, destaque ? "Destaque removido" : "Cartão destacado")}
                aoRemover={() => mudarLayout("Cartão removido", (ws) => ws.filter((x) => x.id !== w.id))}
                aoBaixarCsv={() => void exportarCartao(w)}
                aoArrastar={(e) => arrastar(w.id, e)}
                aoRedimensionar={(e) => redimensionar(w.id, e)}
                aoTeclado={(e) => teclado(w.id, e)}
              >
                {especial ? (
                  visao ? <ConteudoDaVisao fonte={w.fonte} visao={visao} escuro={destaque} /> : <Esqueleto />
                ) : w.fonte === "report" && w.relatorio ? (
                  <CartaoDeRelatorio relatorio={w.relatorio} globais={globais} />
                ) : w.fonte === "custom" && w.consulta ? (
                  <div className="min-h-0 flex-1 overflow-auto">
                    <ConteudoDeConsulta consulta={w.consulta} tipo={tipoDeConsulta(w.tipo)} globais={globais} />
                  </div>
                ) : fonte ? (
                  <Conteudo widget={w} fonte={fonte} dados={dados} altura={altura} />
                ) : null}
              </Cartao>
            );
          })}
          {podeEditar && <AdicionarCartao aoClicar={() => setAdicionando(true)} />}
        </div>
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

/** Itens do menu ⋯ para trocar o visual (ou editar o que o cartão mede). */
function Visuais({
  widget, fonte, aoTrocar, aoEditarConsulta,
}: {
  widget: Widget;
  fonte: Fonte | undefined;
  aoTrocar: (t: Tipo) => void;
  aoEditarConsulta: () => void;
}) {
  if (widget.fonte === "report" && widget.relatorio) {
    return (
      <>
        <DropdownMenuItem onSelect={aoEditarConsulta}>
          <SlidersHorizontal aria-hidden="true" /> Editar no construtor
        </DropdownMenuItem>
        <DropdownMenuSeparator />
      </>
    );
  }
  const custom = widget.fonte === "custom" && widget.consulta;
  const tipos: Tipo[] = custom ? tiposPermitidos_(widget.consulta!) : fonte ? TIPOS_POR_FONTE[fonte.tipo] : [];
  if (!custom && tipos.length < 2) return null;
  return (
    <>
      {tipos.length > 1 && <DropdownMenuLabel>Visual</DropdownMenuLabel>}
      {tipos.length > 1 &&
        tipos.map((t) => {
          const Icone = ICONE_DO_TIPO[t];
          return (
            <DropdownMenuItem key={t} onSelect={() => aoTrocar(t)} aria-checked={widget.tipo === t} role="menuitemradio">
              <Icone aria-hidden="true" /> {NOME_DO_TIPO[t]}
              {widget.tipo === t && <Check className="ml-auto" aria-hidden="true" />}
            </DropdownMenuItem>
          );
        })}
      {custom && (
        <DropdownMenuItem onSelect={aoEditarConsulta}>
          <SlidersHorizontal aria-hidden="true" /> Editar o que ele mede
        </DropdownMenuItem>
      )}
      <DropdownMenuSeparator />
    </>
  );
}

// ── Conteúdo dos cartões de fonte fixa ─────────────────────────────────────

/** Fontes cujas séries e quebras vêm em reais (o resto é contagem). */
const EM_REAIS = new Set(["receitaPorDia", "porEtapa"]);

const reaisInteiros = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

/** Altura útil do gráfico dentro de um cartão de `altura` linhas. */
const alturaDoGrafico = (altura: number) => Math.max(90, altura * 184 - 104);

function Esqueleto() {
  return <div className="min-h-16 flex-1 animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none" aria-busy="true" />;
}

function CartaoDeRelatorio({ relatorio, globais }: { relatorio: NonNullable<Widget["relatorio"]>; globais: FiltrosGlobais }) {
  const { result, error, loading } = useReportResult(relatorio.query, globais, 0);
  return <ReportView result={result} viz={relatorio.viz} meta={relatorio.meta} loading={loading} error={error} className="min-h-0 flex-1" />;
}

function Conteudo({ widget, fonte, dados, altura }: { widget: Widget; fonte: Fonte; dados: Dados | null; altura: number }) {
  if (!dados) return <Esqueleto />;

  if (widget.tipo === "numero") {
    return (
      <div className="mt-auto">
        <NumeroGrande valor={dados.numeros[fonte.chave] ?? null} formatar={(v) => formatar(v, fonte.formato)} />
      </div>
    );
  }

  if (widget.tipo === "linha") {
    const serie = dados.series[fonte.chave] ?? [];
    if (!serie.some((p) => p.value > 0)) return <Vazio />;
    return <AreaChart data={serie} height={alturaDoGrafico(altura)} formatarValor={EM_REAIS.has(fonte.chave) ? reaisInteiros : undefined} />;
  }

  if (widget.tipo === "pizza") {
    const quebra = (dados.quebras[fonte.chave] ?? []).filter((p) => p.value > 0);
    if (quebra.length === 0) return <Vazio />;
    return <DonutChart segments={quebra.map((p) => ({ ...p, label: rotular(p.label) }))} size={Math.min(150, alturaDoGrafico(altura) - 10)} />;
  }

  if (widget.tipo === "funil") {
    return (
      <div className="min-h-0 flex-1 overflow-auto">
        <FunnelChart etapas={dados.funis?.[fonte.chave] ?? []} />
      </div>
    );
  }

  if (widget.tipo === "barras") {
    const funil = dados.funis?.[fonte.chave]?.map((e) => ({ label: e.nome, value: e.quantidade }));
    const itens = (funil ?? dados.quebras[fonte.chave] ?? dados.series[fonte.chave] ?? []).filter((p) => p.value > 0);
    if (itens.length === 0) return <Vazio />;
    const maior = Math.max(...itens.map((i) => i.value));
    const emReais = EM_REAIS.has(fonte.chave);
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-auto pt-1">
        {itens.slice(0, 10).map((i) => {
          const valor = emReais ? reaisInteiros(i.value) : i.value.toLocaleString("pt-BR");
          return (
            <div key={i.label} title={`${rotular(i.label)}: ${valor}`}>
              <div className="mb-1 flex items-center justify-between gap-3 text-small">
                <span className="truncate text-text-secondary">{rotular(i.label)}</span>
                <span className="shrink-0 text-caption tabular-nums text-text-tertiary">{valor}</span>
              </div>
              <div className="h-1.5 rounded-full bg-hover">
                <div
                  className="h-1.5 rounded-full bg-accent-solid transition-[width] duration-500 motion-reduce:transition-none"
                  style={{ width: `${Math.max(2, (i.value / maior) * 100)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const linhas = dados.tabelas[fonte.chave] ?? [];
  if (linhas.length === 0) return <Vazio />;
  // Tabela de funil (parados): a coluna do meio é a etapa, e "quando" é desde quando está nela.
  const porEtapa = linhas.some((l) => l.etapa !== undefined);
  return (
    <div className="-mx-2 min-h-0 flex-1 overflow-auto pt-1">
      <table className="w-full min-w-[440px] border-collapse">
        <thead>
          <tr className="text-left text-caption text-text-tertiary">
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
              <td className="whitespace-nowrap px-2 py-2 text-right font-semibold tabular-nums text-text-primary">
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label="Adicionar cartão">
      <div className="absolute inset-0 bg-backdrop" onClick={onFechar} />
      <div className="border border-border-default bg-overlay shadow-overlay relative z-10 flex max-h-[80vh] w-full max-w-[560px] flex-col overflow-hidden rounded-[18px]">
        <header className="border-b border-border-subtle p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-body-lg font-semibold text-text-primary">
                O que você quer ver?
              </h2>
              <p className="mt-1 text-small text-text-secondary">
                Escolha o número primeiro. O visual e o tamanho você ajusta no próprio cartão.
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
                <p className="px-3 py-1.5 text-caption font-medium text-text-tertiary">
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
