"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { useContrato, useRouter, useSearchParams } from "@/lib/contrato/navegacao";
import { apiDoContrato } from "@/lib/contrato/rotas";
import {
  ChevronsLeftRight,
  ChevronsRightLeft,
  ChevronsUpDown,
  CircleHelp,
  Columns3,
  Ellipsis,
  FileSpreadsheet,
  FileText,
  Handshake,
  ListFilter,
  Plus,
  Rows3,
  Search,
  Settings,
  Sun,
  Upload,
} from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { AbasDeVisoes, CamposRemovidos, useVisoesDaLista } from "@/components/crm/listas/visoes-salvas";
import { AcoesEmMassaDeNegocios, SELECAO_VAZIA, type Selecao } from "@/components/crm/listas/acoes-em-massa";
import { camposRemovidos, configDoEstado, estadoDaConfig, semCamposRemovidos } from "@/lib/visoes/visoes";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { formatMoney } from "@/components/ui/kanban-column";
import { BarraDeFiltros } from "@/components/crm/listas/barra-de-filtros";
import { useComAtraso, useEstadoDaLista } from "@/components/crm/listas/use-estado-da-lista";
import { useListaSalva } from "@/components/crm/listas/use-lista-salva";
import { opcoesDaBarra, opcoesDoEditor, opcoesExtrasDoEditor, useOpcoesDoCrm } from "@/components/crm/listas/use-opcoes-do-crm";
import { PreviaDoNegocio, type EtapaDaPrevia } from "@/components/crm/negocios/previa";
import { DealCard } from "@/components/crm/negocios/deal-card";
import { StageColumn } from "@/components/crm/negocios/stage-column";
import { ListaDeNegocios, type LinhaDeNegocio } from "@/components/crm/negocios/lista-de-negocios";
import { NovoNegocio, type FunilDaTela } from "@/components/crm/negocios/novo-negocio";
import { ImportarNegocios } from "@/components/crm/negocios/importar-negocios";
import type { EtapaDeConversao } from "@/components/crm/negocios/resumo";
import { Comemoracao, DiaDeHoje, Momentos, VozDoQuadro, type EstiloDaTela } from "@/components/crm/negocios/eva-topo";
import { comemoracao, desdeOntem, gargaloDaConversao, listaDeAtencao, momentos, montarRecado, type ItemDeAtencao } from "@/components/crm/negocios/eva-voz";
import { ModalDaLegenda } from "@/components/crm/negocios/legenda";
import { ZonasDeFechamento, ZONA_GANHO, ZONA_PERDIDO } from "@/components/crm/negocios/zonas-de-fechamento";
import { usePreferencia } from "@/components/crm/negocios/use-preferencia";
import { useMudancaDeEtapa } from "@/components/crm/negocios/mudanca-de-etapa";
import { aplicarVisao, VISOES_DE_NEGOCIO } from "@/components/crm/negocios/visoes";
import { juntarCartoes, moverCartao, type EtapaKanban, type NegocioKanban } from "@/components/crm/negocios/modelo";
import { LAYOUT_PADRAO, normalizarLayout, type LayoutDoCartao } from "@/lib/cartao-layout";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { CAMPOS_DE_NEGOCIO } from "@/lib/filtro-crm";
import { SEM_VALOR, diaLocal } from "@/lib/consulta";
import { chaveDasColunas, colunasValidas } from "@/lib/listas/colunas";
import { montarFiltro, totalAvancado, type FiltroDaBarra } from "@/lib/listas/estado-da-lista";
import { avisarNaIlha } from "@/lib/fundo/eventos";
import type { FilterOption } from "@/components/ui/filter-button";

// ---------------------------------------------------------------------------
// Negócios: quadro paginado por coluna (30 cartões, "Carregar mais" ao rolar)
// e lista paginada no servidor, com as mesmas visões, barra de filtros e
// filtros avançados. Arrastar entre etapas (dnd-kit) e as zonas Ganho/Perdido
// continuam; os estilos "Eva · 1/2/3" mostram a voz da Eva no design system.
//
// v5: o quadro é a tela. Filtros moram no botão "Filtros", importar/exportar/
// configurar no "…", o recado da Eva vai para a ilha e "Seu dia" (desde
// ontem / pede atenção) abre numa gaveta.
// ---------------------------------------------------------------------------

const BARRA_DE_NEGOCIOS: FiltroDaBarra[] = [
  { campo: "contato", rotulo: "Contatos", param: "contato", tipo: "lista" },
  { campo: "empresa", rotulo: "Empresas", param: "empresa", tipo: "lista" },
  { campo: "responsavel", rotulo: "Proprietário", param: "dono", tipo: "lista" },
  { campo: "equipe", rotulo: "Equipes", param: "equipe", tipo: "lista" },
  { campo: "tarefa", rotulo: "Tarefas", param: "tarefa", tipo: "lista" },
  { campo: "etiqueta", rotulo: "Etiquetas", param: "etiqueta", tipo: "lista" },
  { campo: "produto", rotulo: "Produtos", param: "produto", tipo: "lista" },
  { campo: "criadoEm", rotulo: "Criado em", param: "criado", tipo: "data" },
  { campo: "fechadoEm", rotulo: "Fechado em", param: "fechado", tipo: "data" },
];
const PADRAO = { visao: "todos", tamanho: 25 };
const IDS_DAS_VISOES = VISOES_DE_NEGOCIO.map((v) => v.id as string);
const POR_ETAPA = 30;

/** Lista de ids guardada no navegador, sem validar (quem usa valida contra as disponíveis). */
function lerListaDeIds(bruto: string | null): string[] {
  try {
    const v = JSON.parse(bruto ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

const digitando = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

/** Grava um parâmetro na URL sem recarregar (o roteador do Next acompanha). */
function gravarParametro(nome: string, valor: string | null) {
  const sp = new URLSearchParams(window.location.search);
  if (valor) sp.set(nome, valor);
  else sp.delete(nome);
  sp.delete("p");
  const qs = sp.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
}

interface Quadro {
  stages: EtapaKanban[];
  defs: DefinicaoDeCampo[];
  layout: LayoutDoCartao;
  avisos: string[];
  truncado: boolean;
}

function NegociosConteudo() {
  const contrato = useContrato();
  const router = useRouter();
  const sp = useSearchParams();
  const opcoes = useOpcoesDoCrm("negocios");
  const [pipelines, setPipelines] = React.useState<FunilDaTela[]>([]);
  const funilDaUrl = sp.get("funil");
  const pipelineId = pipelines.find((p) => p.id === funilDaUrl)?.id ?? pipelines[0]?.id ?? "";
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  // Visões salvas do funil (e as de todos os funis) + a padrão da pessoa.
  const visoes = useVisoesDaLista("negocios", VISOES_DE_NEGOCIO, PADRAO, pipelineId || undefined);
  const padrao = React.useMemo(() => ({ ...PADRAO, visao: visoes.padrao }), [visoes.padrao]);
  const [estado, setEstado] = useEstadoDaLista(BARRA_DE_NEGOCIOS, padrao, { visoes: IDS_DAS_VISOES, baseDaVisao: visoes.baseDaVisao });
  const visaoSalva = visoes.salva(estado.visao);
  const visaoBase = visoes.visaoBase(estado.visao);

  const [modo, setModo] = usePreferencia("eva:negocios:visao", "kanban", ["kanban", "lista"] as const);
  // Visão salva com modo (quadro/lista) guardado: abre nele.
  const modoDaVisao = visaoSalva?.config.modo;
  React.useEffect(() => {
    if (modoDaVisao) setModo(modoDaVisao);
    // só quando a visão (ou o modo guardado nela) muda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.visao, modoDaVisao]);
  // Estilo escolhido pelo dono do produto: Eva · 3, fixo (o seletor de
  // comparação saiu; uma escolha antiga "Atual" guardada no navegador não volta).
  const estilo = "v3" as EstiloDaTela;
  const [quadro, setQuadro] = React.useState<Quadro | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [carregandoMais, setCarregandoMais] = React.useState<Set<string>>(new Set());
  const [erro, setErro] = React.useState<string | null>(null);
  const [versao, setVersao] = React.useState(0);
  const [contagens, setContagens] = React.useState<Record<string, number>>({});
  const [conversao, setConversao] = React.useState<EtapaDeConversao[]>([]);
  const [novoNaEtapa, setNovoNaEtapa] = React.useState<string | null>(null);
  // "Criar negócio" da busca global: /negocios?novo=<carimbo>. Cada carimbo
  // abre o "novo negócio" uma vez (ajuste de estado no render, sem efeito).
  const pedidoDeNovo = sp.get("novo");
  const [pedidoAtendido, setPedidoAtendido] = React.useState<string | null>(null);
  if (pedidoDeNovo && pedidoDeNovo !== pedidoAtendido) {
    setPedidoAtendido(pedidoDeNovo);
    setNovoNaEtapa("");
  }
  function fecharNovo() {
    setNovoNaEtapa(null);
    // Recarregar a página não reabre o formulário.
    const q = new URLSearchParams(window.location.search);
    if (!q.has("novo")) return;
    q.delete("novo");
    const qs = q.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
  }
  const [importando, setImportando] = React.useState(false);
  const [editandoColunas, setEditandoColunas] = React.useState(false);
  const [previa, setPrevia] = React.useState<{ id: string; deal: NegocioKanban; etapa: EtapaDaPrevia } | null>(null);
  const [dragging, setDragging] = React.useState<{ deal: NegocioKanban; tipo: string; prazo?: number | null } | null>(null);
  // Relógio da tela: muda só quando os dados chegam (tempo na etapa, atrasos).
  const [agora, setAgora] = React.useState(() => new Date());
  const buscaRef = React.useRef<HTMLInputElement>(null);
  const [buscaAberta, setBuscaAberta] = React.useState(false);
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);
  const [diaAberto, setDiaAberto] = React.useState(false);
  const [legendaAberta, setLegendaAberta] = React.useState(false);
  const hoje = diaLocal(agora);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Teclado: espaço pega, setas movem, espaço solta (Enter fica para abrir).
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } })
  );

  React.useEffect(() => {
    const lerFunis = () =>
      fetch("/api/pipelines")
        .then((r) => r.json())
        .then((d) => (d.pipelines ?? []) as FunilDaTela[])
        .catch(() => [] as FunilDaTela[]);
    lerFunis()
      .then(async (lista) => {
        if (lista.length) return lista;
        // Contrato sem funil: o GET do quadro sem funil cria o padrão.
        await fetch("/api/deals?porEtapa=1").catch(() => null);
        return lerFunis();
      })
      .then((lista) => {
        setPipelines(lista);
        if (!lista.length) setCarregando(false);
      });
  }, []);

  // Atalhos: "/" busca, "n" cria. Nunca enquanto a pessoa digita.
  React.useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || digitando(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        // Fechada, a busca é só a lupa: abrir monta o campo já com foco.
        setBuscaAberta(true);
        buscaRef.current?.focus();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setNovoNaEtapa("");
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  // ── Filtro: barra + avançados + visão ──
  const { filtro, conflito } = React.useMemo(
    () => aplicarVisao(montarFiltro(estado, BARRA_DE_NEGOCIOS, { hoje }), visaoBase, opcoes.meuId, hoje),
    [estado, visaoBase, opcoes.meuId, hoje]
  );
  const chaveDoQuadro = React.useMemo(() => JSON.stringify({ pipelineId, filtro }), [pipelineId, filtro]);
  const chaveAtrasada = useComAtraso(chaveDoQuadro, 250);
  // Espera as visões (a padrão da pessoa decide o que a URL sem ?v= mostra).
  const pronto = !!pipelineId && visoes.carregado && (opcoes.carregado || visaoBase !== "meus");

  // ── Quadro: N primeiros cartões de cada coluna + totais agregados ──
  const ultimaCarga = React.useRef(0);
  React.useEffect(() => {
    if (!pronto) return;
    const { pipelineId: funil, filtro: f } = JSON.parse(chaveAtrasada) as { pipelineId: string; filtro: unknown };
    const carga = ++ultimaCarga.current;
    let vivo = true;
    const q = new URLSearchParams({ pipeline: funil, porEtapa: String(POR_ETAPA), filtro: JSON.stringify(f) });
    Promise.all([fetch(`/api/deals?${q}`), fetch(`/api/deals/funil?pipeline=${funil}`).catch(() => null)])
      .then(async ([res, funilRes]) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar os negócios.");
        const dadosDoFunil = funilRes?.ok ? await funilRes.json().catch(() => null) : null;
        if (!vivo || carga !== ultimaCarga.current) return;
        const campos: DefinicaoDeCampo[] = data.fields ?? [];
        setQuadro({
          stages: data.stages ?? [],
          defs: campos,
          layout: data.layout ? normalizarLayout(data.layout, campos.map((c) => c.key)) : LAYOUT_PADRAO,
          avisos: data.avisos ?? [],
          truncado: !!data.truncado,
        });
        setConversao(dadosDoFunil?.conversao ?? []);
        setAgora(new Date());
        setErro(null);
      })
      .catch((e: Error) => vivo && carga === ultimaCarga.current && setErro(e.message))
      .finally(() => vivo && carga === ultimaCarga.current && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [chaveAtrasada, pronto, versao]);

  const stages = React.useMemo(() => quadro?.stages ?? [], [quadro]);
  const setStages = (f: (s: EtapaKanban[]) => EtapaKanban[]) => setQuadro((q) => (q ? { ...q, stages: f(q.stages) } : q));

  async function carregarMais(etapa: EtapaKanban) {
    if (!etapa.temMais || !etapa.depois || carregandoMais.has(etapa.id)) return;
    setCarregandoMais((s) => new Set(s).add(etapa.id));
    const q = new URLSearchParams({ etapa: etapa.id, depois: etapa.depois, porEtapa: String(POR_ETAPA), filtro: JSON.stringify(filtro) });
    const res = await fetch(`/api/deals?${q}`).catch(() => null);
    const d = res?.ok ? await res.json().catch(() => null) : null;
    setCarregandoMais((s) => {
      const n = new Set(s);
      n.delete(etapa.id);
      return n;
    });
    if (!d) {
      setErro(`Não foi possível carregar mais negócios de ${etapa.name}.`);
      return;
    }
    setStages((ss) => ss.map((s) => (s.id === etapa.id ? { ...s, deals: juntarCartoes(s.deals, d.deals ?? []), temMais: !!d.temMais, depois: d.depois ?? null } : s)));
  }

  // ── Contagens das abas: de sistema = a visão sozinha; salva = o filtro dela ──
  const filtrosDasAbas = React.useMemo(
    () => [
      ...VISOES_DE_NEGOCIO.map((v) => ({ id: v.id as string, filtro: aplicarVisao({ logica: "e", grupos: [] }, v.id, opcoes.meuId, hoje).filtro })),
      ...visoes.visoes.map((v) => ({
        id: v.id,
        filtro: aplicarVisao(montarFiltro(estadoDaConfig(v.config, PADRAO, v.id), BARRA_DE_NEGOCIOS, { hoje }), v.config.visaoBase, opcoes.meuId, hoje).filtro,
      })),
    ],
    [visoes.visoes, opcoes.meuId, hoje]
  );
  React.useEffect(() => {
    if (!pipelineId || !opcoes.carregado) return;
    let vivo = true;
    Promise.all(
      filtrosDasAbas.map((v) =>
        fetch("/api/deals/busca", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filtro: v.filtro, pipeline: pipelineId, apenasTotal: true }),
        })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => [v.id, d?.total] as const)
          .catch(() => [v.id, undefined] as const)
      )
    ).then((pares) => {
      if (!vivo) return;
      const c: Record<string, number> = {};
      for (const [id, total] of pares) if (typeof total === "number") c[id] = total;
      setContagens(c);
    });
    return () => {
      vivo = false;
    };
  }, [pipelineId, opcoes.carregado, filtrosDasAbas, versao]);

  // ── Colunas recolhidas: as da visão salva (ou o ajuste não salvo dela, na
  // URL); nas de sistema, as do navegador (por usuário e funil), como antes ──
  const idsDasEtapas = React.useMemo(() => stages.map((s) => s.id), [stages]);
  const validarRecolhidas = React.useCallback((bruto: string | null) => colunasValidas(bruto, idsDasEtapas, []), [idsDasEtapas]);
  const [recolhidasDoNavegador, gravarRecolhidasDoNavegador] = useListaSalva(
    `eva:recolhidas:negocios:${contrato ?? "-"}:${opcoes.meuId || "-"}:${pipelineId}`,
    validarRecolhidas
  );
  const recolhidas = estado.recolhidas ? estado.recolhidas.filter((id) => idsDasEtapas.includes(id)) : recolhidasDoNavegador;
  const gravarRecolhidas = (ids: string[]) => (visaoSalva ? setEstado({ ...estado, recolhidas: ids }) : gravarRecolhidasDoNavegador(ids));
  const tudoRecolhido = stages.length > 0 && recolhidas.length === stages.length;

  // ── Colunas da lista: idem (a lista valida contra as colunas disponíveis) ──
  const [colunasDoNavegador, gravarColunasDoNavegador] = useListaSalva(chaveDasColunas("negocios", contrato, opcoes.meuId), lerListaDeIds);
  const colunasDaLista = estado.colunas ?? (colunasDoNavegador.length ? colunasDoNavegador : undefined);
  const gravarColunasDaLista = (ids: string[]) => (visaoSalva ? setEstado({ ...estado, colunas: ids }) : gravarColunasDoNavegador(ids));

  // ── Seleção e ações em massa (lista) ──
  const [selecao, setSelecao] = React.useState<Selecao>(SELECAO_VAZIA);
  const chaveDaSelecao = chaveDoQuadro;
  const [filtroDaSelecao, setFiltroDaSelecao] = React.useState(chaveDaSelecao);
  if (filtroDaSelecao !== chaveDaSelecao) {
    setFiltroDaSelecao(chaveDaSelecao);
    setSelecao(SELECAO_VAZIA);
  }

  // Filtro em campo que não existe mais: chip "campo removido" (o motor já ignora).
  const removidos = React.useMemo(
    () => (quadro && opcoes.carregado ? camposRemovidos(estado.avancado, "negocios", [...new Set([...quadro.defs, ...opcoes.campos].map((c) => c.key))]) : []),
    [quadro, opcoes.carregado, opcoes.campos, estado.avancado]
  );
  const configAtual = () =>
    configDoEstado(estado, {
      visaoBase,
      colunas: colunasDaLista,
      recolhidas: estado.recolhidas ?? recolhidasDoNavegador,
      modo,
    });

  // ── Contatos do filtro "Contatos ▾": busca no servidor ──
  const [contatosOpcoes, setContatosOpcoes] = React.useState<FilterOption[]>([]);
  // Nome de quem já apareceu na busca: o escolhido continua com nome depois de outra busca.
  const [nomesDeContato, setNomesDeContato] = React.useState<Record<string, string>>({});
  const buscarContatos = React.useCallback((q: string) => {
    fetch("/api/contacts/busca", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q, pageSize: 25 }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const lista: FilterOption[] = (d?.contacts ?? []).map((c: { id: string; name: string; email: string; phone: string }) => ({
          value: c.id,
          label: c.name || c.email || c.phone || "Sem nome",
        }));
        setNomesDeContato((m) => ({ ...m, ...Object.fromEntries(lista.map((o) => [o.value, o.label])) }));
        setContatosOpcoes(lista);
      })
      .catch(() => undefined);
  }, []);
  React.useEffect(() => {
    buscarContatos("");
  }, [buscarContatos]);
  const selecionadosDeContato = estado.listas.contato;
  const opcoesDeContato = React.useMemo(() => {
    const ja = new Set(contatosOpcoes.map((o) => o.value));
    const extras = (selecionadosDeContato ?? []).filter((id) => !ja.has(id)).map((id) => ({ value: id, label: nomesDeContato[id] ?? "Contato escolhido" }));
    return [...extras, ...contatosOpcoes];
  }, [contatosOpcoes, selecionadosDeContato, nomesDeContato]);

  const barraOpcoes = React.useMemo(() => ({ ...opcoesDaBarra(opcoes), contato: opcoesDeContato }), [opcoes, opcoesDeContato]);
  const editor = React.useMemo(
    () => ({
      catalogo: CAMPOS_DE_NEGOCIO,
      opcoes: opcoesDoEditor(opcoes),
      extras: opcoesExtrasDoEditor(opcoes, opcoesDeContato.map((o) => ({ id: o.value, label: o.label }))),
      campoInicialId: "etapa",
      entidade: "negócios",
    }),
    [opcoes, opcoesDeContato]
  );

  // ── Voz da Eva (sobre os cartões carregados) ──
  const eva = estilo !== "classico";
  const recado = React.useMemo(
    () => (carregando || !eva ? null : montarRecado(stages, agora, opcoes.meuNome, gargaloDaConversao(conversao))),
    [carregando, eva, stages, agora, conversao, opcoes.meuNome]
  );
  // O recado da Eva não ocupa mais a frente do quadro: vai para a ilha uma vez
  // por visita, com o título sem a saudação e a frase principal como detalhe.
  const recadoAvisado = React.useRef(false);
  React.useEffect(() => {
    if (!recado || recadoAvisado.current) return;
    recadoAvisado.current = true;
    const titulo = recado.titulo.replace(/^[^.]*\.\s+/, "") || recado.titulo;
    avisarNaIlha({ titulo, detalhe: recado.partes.map((p) => p.texto).join("").trim() });
  }, [recado]);
  const momentosDoFunil = React.useMemo(() => (eva ? momentos(stages, agora) : []), [eva, stages, agora]);
  const atencaoDoDia = React.useMemo(() => listaDeAtencao(stages, agora), [stages, agora]);
  const acontecimentosDoDia = React.useMemo(() => desdeOntem(stages, agora), [stages, agora]);

  function aoAcaoDaAtencao(item: ItemDeAtencao) {
    // WhatsApp vai direto para a conversa; o resto abre a prévia.
    if (item.acao === "whatsapp" && item.deal.whatsapp) {
      router.push(`/conversas?c=${item.deal.whatsapp.conversationId}`);
      return;
    }
    abrirDoQuadro(item.deal);
  }
  // Comemoração: negócio que apareceu na etapa ganha desde a última olhada
  // (arraste, prévia ou outra pessoa) e fechou agora há pouco. Trocar de
  // filtro ou carregar mais cartões revela ganhos antigos: esses não contam.
  const [festa, setFesta] = React.useState<{ titulo: string; detalhe: string } | null>(null);
  const ganhosVistos = React.useRef<{ quadro: string; ids: Set<string> } | null>(null);
  React.useEffect(() => {
    if (carregando) return;
    const chave = stages.map((e) => e.id).join(",") + chaveAtrasada;
    const etapaGanha = stages.find((e) => e.type === "won");
    const ids = new Set(etapaGanha?.deals.map((d) => d.id) ?? []);
    const antes = ganhosVistos.current;
    ganhosVistos.current = { quadro: chave, ids };
    if (!antes || antes.quadro !== chave || (estilo !== "v2" && estilo !== "v3")) return;
    const recente = (d: NegocioKanban) => !d.closedAt || Date.now() - Date.parse(d.closedAt) < 15 * 60_000;
    const novo = etapaGanha?.deals.find((d) => !antes.ids.has(d.id) && recente(d));
    if (!novo) return;
    const titulo = novo.company?.name || novo.contacts[0]?.name || novo.name;
    setFesta(comemoracao(titulo, novo.amountCents, etapaGanha?.count ?? ids.size));
  }, [carregando, stages, estilo, chaveAtrasada]);
  const fecharFesta = React.useCallback(() => setFesta(null), []);

  // ── Arrastar ──
  // Mudou de etapa: o fundo pulsa a partir do cartão e a ilha oferece Desfazer.
  const mudanca = useMudancaDeEtapa({
    onErro: (m) => setErro(m),
    naIlha: { elemento: (id) => document.querySelector(`[data-deal-id="${CSS.escape(id)}"]`) },
  });
  const etapaGanha = stages.find((s) => s.type === "won");
  const etapaPerdida = stages.find((s) => s.type === "lost");

  function handleDragStart(event: DragStartEvent) {
    for (const s of stages) {
      const deal = s.deals.find((d) => d.id === event.active.id);
      if (deal) return setDragging({ deal, tipo: s.type, prazo: s.rottingDays });
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDragging(null);
    const dealId = String(event.active.id);
    const alvo = event.over ? String(event.over.id) : "";
    const stageId = alvo === ZONA_GANHO ? etapaGanha?.id : alvo === ZONA_PERDIDO ? etapaPerdida?.id : alvo;
    if (!stageId) return;
    const from = stages.find((s) => s.deals.some((d) => d.id === dealId));
    if (!from || from.id === stageId) return;
    const deal = from.deals.find((d) => d.id === dealId)!;
    const para = stages.find((s) => s.id === stageId);
    if (!para || !quadro) return;
    const antes = stages;
    // Move na tela antes da resposta: esperar o servidor deixa o quadro lento.
    // Perdido não: o modal do motivo vem antes.
    if (para.type !== "lost") setStages((ss) => moverCartao(ss, dealId, stageId, new Date()));
    // Regras da etapa no servidor: faltou campo → "Complete para mover";
    // perdido → motivo; negócio fechado → aviso (só sai com Reabrir).
    const r = await mudanca.mover({
      dealId,
      nome: deal.name,
      pipelineId,
      para,
      defs: quadro.defs,
      // Toast com "Desfazer": volta para a coluna de onde saiu.
      de: { id: from.id, name: from.name, type: from.type },
      aoDesfazer: () => setVersao((v) => v + 1),
    });
    if (r === "movido") {
      setVersao((v) => v + 1);
      return;
    }
    // Cancelou ou falhou: o cartão volta para onde estava.
    setStages(() => antes);
  }

  // ── Prévia ──
  const etapasDaPrevia: EtapaDaPrevia[] = stages.length
    ? stages
    : (pipeline?.stages ?? []).map((s) => ({ id: s.id, name: s.name, type: s.type, color: "" }));
  function abrirDoQuadro(deal: NegocioKanban) {
    const etapa = stages.find((s) => s.deals.some((d) => d.id === deal.id));
    if (etapa) setPrevia({ id: deal.id, deal, etapa });
  }
  function abrirDaLista(linha: LinhaDeNegocio) {
    const etapa = etapasDaPrevia.find((s) => s.id === linha.stage.id) ?? { ...linha.stage, color: "" };
    setPrevia({ id: linha.id, deal: linha, etapa });
  }
  // Depois de mover pela prévia, o cartão aparece na coluna nova: usa ele.
  const previaAtual = previa
    ? (stages.flatMap((e) => e.deals.filter((d) => d.id === previa.id).map((deal) => ({ deal, etapa: e as EtapaDaPrevia })))[0] ?? previa)
    : null;

  // ── Topo ──
  const abertas = stages.filter((s) => s.type === "open");
  const qtdAbertos = abertas.reduce((s, e) => s + (e.count ?? e.deals.length), 0);
  const totalAberto = abertas.reduce((s, e) => s + e.totalCents, 0);
  const ponderado = abertas.reduce((s, e) => s + e.weightedCents, 0);

  // Exportar leva o funil e o MESMO filtro da tela (barra, avançados, visão e
  // busca) pelo motor. Busca/um proprietário/visão de sistema vão junto só
  // para o texto do relatório (o servidor filtra pelo `filtro`).
  const consultaDeExportacao = React.useMemo(() => {
    const p = new URLSearchParams();
    if (pipelineId) p.set("pipeline", pipelineId);
    p.set("filtro", JSON.stringify(filtro));
    if (estado.busca.trim()) p.set("busca", estado.busca.trim());
    const donos = estado.listas.responsavel ?? [];
    if (donos.length === 1) p.set("dono", donos[0] === SEM_VALOR ? "__sem" : donos[0]);
    if (visaoBase !== "todos") p.set("visao", visaoBase);
    return p.toString();
  }, [pipelineId, filtro, estado.busca, estado.listas.responsavel, visaoBase]);

  // Quantos filtros da barra e avançados estão ligados (contador do "Filtros").
  const nFiltros =
    Object.values(estado.listas).filter((v) => v && v.length > 0).length + Object.keys(estado.datas).length + totalAvancado(estado);
  const mostraBusca = buscaAberta || !!estado.busca;
  const temDia = eva && !carregando && (acontecimentosDoDia.length > 0 || atencaoDoDia.length > 0 || momentosDoFunil.length > 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 px-4 pb-4 pt-1 lg:px-6">
      {/* Barra da tela: título, funil, modo e, à direita, busca, filtros, "…" e a ação principal. */}
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">Negócios</h1>
        {quadro && (
          <span className="font-mono text-caption tabular-nums text-text-tertiary">
            {qtdAbertos.toLocaleString("pt-BR")} {qtdAbertos === 1 ? "aberto" : "abertos"}
          </span>
        )}
        <span aria-hidden="true" className="h-5 w-px bg-border-subtle" />
        {pipelines.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" aria-label={`Funil: ${pipeline?.name ?? ""}. Trocar de funil`} className="px-2.5 text-text-primary">
                <Columns3 size={14} aria-hidden="true" className="text-text-tertiary" />
                {pipeline?.name ?? "Funil"}
                <ChevronsUpDown size={14} aria-hidden="true" className="text-text-tertiary" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Funis</DropdownMenuLabel>
              {pipelines.map((p) => (
                <DropdownMenuCheckboxItem
                  key={p.id}
                  checked={p.id === pipelineId}
                  onCheckedChange={() => {
                    if (p.id === pipelineId) return;
                    setPrevia(null);
                    gravarParametro("funil", p.id);
                  }}
                >
                  {p.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <SegmentedControl
          label="Visualização"
          value={modo}
          onChange={setModo}
          options={[
            { value: "kanban", label: "Quadro", icon: <Columns3 aria-hidden="true" /> },
            { value: "lista", label: "Lista", icon: <Rows3 aria-hidden="true" /> },
          ]}
        />

        <div className="ml-auto flex items-center gap-2">
          {mostraBusca ? (
            <SearchInput
              ref={buscaRef}
              aria-label="Buscar negócios"
              placeholder="Buscar por nome"
              value={estado.busca}
              onValueChange={(q) => setEstado({ ...estado, busca: q, pagina: 1 })}
              onBlur={() => !estado.busca && setBuscaAberta(false)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && !estado.busca) setBuscaAberta(false);
              }}
              autoFocus={buscaAberta}
              className="w-56"
            />
          ) : (
            <IconButton aria-label="Buscar negócios (/)" tooltip="Buscar (/)" onClick={() => setBuscaAberta(true)}>
              <Search />
            </IconButton>
          )}
          <Button variant="secondary" onClick={() => setFiltrosAbertos(true)} aria-label={nFiltros ? `Filtros, ${nFiltros} ligados` : "Filtros"}>
            <ListFilter size={14} aria-hidden="true" />
            Filtros
            {nFiltros > 0 && <span className="font-mono text-caption tabular-nums text-accent-fg">{nFiltros}</span>}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label="Mais ações: importar, exportar, configurar funil" variant="secondary">
                <Ellipsis />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
              <DropdownMenuItem onSelect={() => setImportando(true)} disabled={!pipeline}>
                <Upload aria-hidden="true" /> Importar
              </DropdownMenuItem>
              <DropdownMenuLabel>Exportar · leva o funil e todos os filtros da tela</DropdownMenuLabel>
              <DropdownMenuItem asChild>
                <a href={apiDoContrato(contrato, `/api/deals/exportar?formato=csv&${consultaDeExportacao}`)} download>
                  <FileSpreadsheet aria-hidden="true" /> Planilha (CSV)
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={apiDoContrato(contrato, `/api/deals/exportar?formato=csv&itens=1&${consultaDeExportacao}`)} download>
                  <FileSpreadsheet aria-hidden="true" /> Planilha de produtos (CSV)
                </a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={`/negocios/relatorio?imprimir=1&${consultaDeExportacao}`}>
                  <FileText aria-hidden="true" /> Relatório (PDF)
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link href={`/negocios/configurar?aba=cartao${pipelineId ? `&funil=${pipelineId}` : ""}`}>
                  <Settings aria-hidden="true" /> Configurar funil, cartão e campos
                </Link>
              </DropdownMenuItem>
              {modo === "kanban" ? (
                <DropdownMenuItem onSelect={() => gravarRecolhidas(tudoRecolhido ? [] : idsDasEtapas)} disabled={!stages.length}>
                  {tudoRecolhido ? <ChevronsLeftRight aria-hidden="true" /> : <ChevronsRightLeft aria-hidden="true" />}
                  {tudoRecolhido ? "Expandir tudo" : "Recolher tudo"}
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => setEditandoColunas(true)}>
                  <Columns3 aria-hidden="true" /> Editar colunas
                </DropdownMenuItem>
              )}
              {eva && (
                <DropdownMenuItem onSelect={() => setDiaAberto(true)} disabled={carregando}>
                  <Sun aria-hidden="true" /> Desde ontem e pede atenção hoje
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onSelect={() => setLegendaAberta(true)}>
                <CircleHelp aria-hidden="true" /> Como ler o quadro
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="primary" onClick={() => setNovoNaEtapa("")} title="Criar negócio (N)">
            <Plus size={14} aria-hidden="true" />
            Novo negócio
          </Button>
        </div>
      </div>

      {/* Abas de visão em cápsula (as visões salvas continuam com menu e "+"), e o total do funil à direita. */}
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div
          className={cn(
            "min-w-0 flex-1",
            "[&_[role=tablist]]:gap-1 [&_[role=tablist]]:pb-0.5 [&_div:has(>[role=tablist])]:border-b-0",
            "[&_[role=tab]]:mb-0 [&_[role=tab]]:h-8 [&_[role=tab]]:rounded-full [&_[role=tab]]:border-b-0 [&_[role=tab]]:px-3 [&_[role=tab]]:text-small",
            "[&_[role=tab][aria-selected=true]]:bg-raised [&_[role=tab][aria-selected=true]]:ring-1 [&_[role=tab][aria-selected=true]]:ring-border-subtle",
            "[&_[role=tab]:hover]:bg-hover [&_[role=tab]>span:last-child]:font-mono [&_[role=tab]>span:last-child]:text-caption"
          )}
        >
          <AbasDeVisoes
            rotulo="Visões de negócios"
            sistema={VISOES_DE_NEGOCIO}
            visoes={visoes}
            estado={estado}
            onEstado={setEstado}
            barra={BARRA_DE_NEGOCIOS}
            contagens={contagens}
            configAtual={configAtual}
            equipes={opcoes.equipes}
            padraoDaLista={PADRAO}
          />
        </div>
        <div className="flex h-8 shrink-0 items-center gap-3">
          {temDia && (
            <Button variant="ghost" size="sm" onClick={() => setDiaAberto(true)} title="Desde ontem e o que pede sua atenção hoje">
              <Sun size={14} aria-hidden="true" />
              Seu dia
              {atencaoDoDia.length > 0 && <span className="font-mono text-caption tabular-nums text-warning">{atencaoDoDia.length}</span>}
            </Button>
          )}
          {quadro && (
            <p className="font-mono text-caption tabular-nums text-text-tertiary">
              <span className="text-text-primary">{formatMoney(totalAberto / 100)}</span> no funil ·{" "}
              <span className="text-text-primary">{formatMoney(ponderado / 100)}</span> ponderado
            </p>
          )}
        </div>
      </div>

      {erro && (
        <Notice tone="danger" onDismiss={() => setErro(null)}>
          {erro}
        </Notice>
      )}
      {conflito && (
        <Notice tone="warning">
          “Precisam de atenção” não combina com filtros avançados em grupos “ou então”: a visão está mostrando só os abertos. Troque a combinação para “e
          também” nos filtros avançados.
        </Notice>
      )}
      {removidos.length > 0 && (
        <CamposRemovidos
          removidos={removidos}
          onTirar={() => setEstado({ ...estado, avancado: semCamposRemovidos(estado.avancado, removidos.map((r) => r.campo)), pagina: 1 })}
        />
      )}
      {modo === "kanban" && quadro && quadro.avisos.length > 0 && <Notice tone="warning">{quadro.avisos.join(" ")}</Notice>}
      {modo === "kanban" && quadro?.truncado && (
        <Notice tone="warning">Um filtro por campo personalizado de número ou data olhou só os primeiros 5.000 negócios; o quadro pode estar incompleto.</Notice>
      )}

      {!pipelines.length && !carregando ? (
        <EmptyState icon={<Handshake />} title="Nenhum funil configurado" description="Um funil padrão é criado sozinho na primeira vez que você abre esta tela." />
      ) : modo === "lista" ? (
        <ListaDeNegocios
          filtro={filtro}
          pipelineId={pipelineId}
          estado={estado}
          onEstado={setEstado}
          defs={quadro?.defs ?? []}
          agora={agora}
          versao={versao}
          colunasSalvas={colunasDaLista}
          onColunas={gravarColunasDaLista}
          editandoColunas={editandoColunas}
          onEditandoColunas={setEditandoColunas}
          onAbrir={abrirDaLista}
          selecao={selecao}
          onSelecao={setSelecao}
          acoesEmMassa={(total, paginaToda) => (
            <AcoesEmMassaDeNegocios
              selecao={selecao}
              onSelecao={setSelecao}
              total={total}
              paginaToda={paginaToda}
              filtro={filtro}
              membros={opcoes.dash.membros}
              pipelineId={pipelineId}
              etapas={etapasDaPrevia}
              onFeito={() => {
                setSelecao(SELECAO_VAZIA);
                setVersao((v) => v + 1);
              }}
            />
          )}
        />
      ) : !quadro ? (
        <div className="flex gap-2 overflow-hidden" aria-busy="true" aria-label="Carregando negócios">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-96 w-64 shrink-0 rounded-[18px]" />
          ))}
        </div>
      ) : (
        <VozDoQuadro.Provider value={estilo === "v2" || estilo === "v3"}>
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setDragging(null)}>
            <div className="relative">
              <div className="flex min-h-96 snap-x gap-2 overflow-x-auto pb-3 [height:calc(100dvh-210px)]">
                {stages.map((stage, i) => (
                  <StageColumn
                    key={stage.id}
                    etapa={stage}
                    etapaAnterior={stages.slice(0, i).filter((e) => e.type === "open").at(-1)?.name ?? null}
                    defs={quadro.defs}
                    layout={quadro.layout}
                    agora={agora}
                    arrastandoAlgo={!!dragging}
                    recolhida={recolhidas.includes(stage.id)}
                    carregandoMais={carregandoMais.has(stage.id)}
                    onRecolher={(v) => gravarRecolhidas(v ? [...recolhidas, stage.id] : recolhidas.filter((id) => id !== stage.id))}
                    onCarregarMais={() => carregarMais(stage)}
                    onAbrir={abrirDoQuadro}
                    onNovo={(id) => setNovoNaEtapa(id)}
                  />
                ))}
              </div>
              <ZonasDeFechamento visivel={!!dragging && dragging.tipo === "open"} temGanho={!!etapaGanha} temPerdido={!!etapaPerdida} />
            </div>
            <DragOverlay dropAnimation={{ duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
              {dragging && (
                <DealCard deal={dragging.deal} tipoDaEtapa={dragging.tipo} prazoParado={dragging.prazo} defs={quadro.defs} agora={agora} layout={quadro.layout} arrastando />
              )}
            </DragOverlay>
          </DndContext>
        </VozDoQuadro.Provider>
      )}

      {/* Todos os filtros de antes (Contatos, Empresas, Proprietário, Equipes, Tarefas, Etiquetas,
          Produtos, Criado em, Fechado em e os avançados) moram aqui; um embaixo do outro. */}
      <Drawer open={filtrosAbertos} onOpenChange={setFiltrosAbertos}>
        <DrawerContent title="Filtros" description="Valem para o quadro, a lista e a exportação." size="sm">
          <div className="[&_[role=toolbar]>div:first-child]:flex-col [&_[role=toolbar]>div:first-child]:items-start [&_[role=toolbar]_.w-px]:hidden">
            <BarraDeFiltros
              rotulo="Filtros de negócios"
              barra={BARRA_DE_NEGOCIOS}
              estado={estado}
              onEstado={setEstado}
              opcoes={barraOpcoes}
              buscaDeOpcoes={{ contato: buscarContatos }}
              editor={editor}
            />
          </div>
        </DrawerContent>
      </Drawer>

      {/* "Desde ontem", "Pede sua atenção hoje" e os momentos saíram da frente do quadro: ficam aqui. */}
      <Drawer open={diaAberto} onOpenChange={setDiaAberto}>
        <DrawerContent title="Seu dia" description="O que mudou desde ontem e o que pede você hoje." size="md">
          <div className="flex flex-col gap-4">
            <Momentos itens={momentosDoFunil} />
            <DiaDeHoje
              empilhado
              acontecimentos={acontecimentosDoDia}
              atencao={atencaoDoDia.slice(0, 8)}
              total={atencaoDoDia.length}
              onAcao={(item) => {
                setDiaAberto(false);
                aoAcaoDaAtencao(item);
              }}
              onVerTodos={() => {
                setDiaAberto(false);
                setEstado({ ...estado, visao: "atencao", pagina: 1 });
              }}
            />
            {acontecimentosDoDia.length === 0 && atencaoDoDia.length === 0 && (
              <p className="text-small text-text-tertiary">Tudo quieto nas últimas horas e nada pedindo você agora.</p>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      <ModalDaLegenda aberto={legendaAberta} onFechar={() => setLegendaAberta(false)} />

      {mudanca.elementos}

      {festa && <Comemoracao titulo={festa.titulo} detalhe={festa.detalhe} onFim={fecharFesta} />}

      {previaAtual && (
        <VozDoQuadro.Provider value={estilo === "v2" || estilo === "v3"}>
          <PreviaDoNegocio
            key={previaAtual.deal.id}
            deal={previaAtual.deal}
            etapa={previaAtual.etapa}
            etapas={etapasDaPrevia}
            layout={quadro?.layout ?? LAYOUT_PADRAO}
            defs={quadro?.defs ?? []}
            agora={agora}
            onFechar={() => setPrevia(null)}
            onMudou={() => setVersao((v) => v + 1)}
            pipelineId={pipelineId}
            onMover={mudanca.mover}
          />
        </VozDoQuadro.Provider>
      )}

      {novoNaEtapa !== null && (
        <NovoNegocio
          pipelines={pipelines}
          pipelineId={pipelineId}
          etapaInicial={novoNaEtapa}
          onClose={fecharNovo}
          onCreated={() => {
            fecharNovo();
            setVersao((v) => v + 1);
          }}
        />
      )}
      {importando && pipeline && (
        <ImportarNegocios
          pipeline={pipeline}
          onClose={() => setImportando(false)}
          onDone={() => {
            setImportando(false);
            setVersao((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}

export default function NegociosPage() {
  // useSearchParams exige Suspense: sem ele o Next recusa gerar a página.
  return (
    <React.Suspense fallback={<div className="flex-1" />}>
      <NegociosConteudo />
    </React.Suspense>
  );
}
