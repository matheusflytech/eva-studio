"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { useContrato, useRouter, useSearchParams } from "@/lib/contrato/navegacao";
import { apiDoContrato } from "@/lib/contrato/rotas";
import { ChevronsRightLeft, ChevronsLeftRight, Columns3, Download, FileSpreadsheet, FileText, Handshake, Plus, Rows3, Settings, Upload } from "lucide-react";
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
import { Button, buttonVariants } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { ViewTabs } from "@/components/ui/view-tabs";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
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
import { Comemoracao, DiaDeHoje, Momentos, RecadoDaEva, SeletorDeEstilo, VozDoQuadro, type EstiloDaTela } from "@/components/crm/negocios/eva-topo";
import { carimbo, comemoracao, desdeOntem, gargaloDaConversao, listaDeAtencao, momentos, montarRecado, type AcaoDoRecado, type ItemDeAtencao } from "@/components/crm/negocios/eva-voz";
import { LegendaDoQuadro } from "@/components/crm/negocios/legenda";
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
import { montarFiltro, type FiltroDaBarra } from "@/lib/listas/estado-da-lista";
import type { FilterOption } from "@/components/ui/filter-button";

// ---------------------------------------------------------------------------
// Negócios: quadro paginado por coluna (30 cartões, "Carregar mais" ao rolar)
// e lista paginada no servidor, com as mesmas visões, barra de filtros e
// filtros avançados. Arrastar entre etapas (dnd-kit) e as zonas Ganho/Perdido
// continuam; os estilos "Eva · 1/2/3" mostram a voz da Eva no design system.
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
  const [estado, setEstado] = useEstadoDaLista(BARRA_DE_NEGOCIOS, PADRAO, IDS_DAS_VISOES);
  const [pipelines, setPipelines] = React.useState<FunilDaTela[]>([]);
  const funilDaUrl = sp.get("funil");
  const pipelineId = pipelines.find((p) => p.id === funilDaUrl)?.id ?? pipelines[0]?.id ?? "";
  const pipeline = pipelines.find((p) => p.id === pipelineId);

  const [modo, setModo] = usePreferencia("eva:negocios:visao", "kanban", ["kanban", "lista"] as const);
  const [estilo, setEstilo] = usePreferencia<EstiloDaTela>("eva:negocios:estilo", "v3", ["classico", "v1", "v2", "v3"]);
  const [quadro, setQuadro] = React.useState<Quadro | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [carregandoMais, setCarregandoMais] = React.useState<Set<string>>(new Set());
  const [erro, setErro] = React.useState<string | null>(null);
  const [versao, setVersao] = React.useState(0);
  const [contagens, setContagens] = React.useState<Record<string, number>>({});
  const [conversao, setConversao] = React.useState<EtapaDeConversao[]>([]);
  const [novoNaEtapa, setNovoNaEtapa] = React.useState<string | null>(null);
  const [importando, setImportando] = React.useState(false);
  const [editandoColunas, setEditandoColunas] = React.useState(false);
  const [previa, setPrevia] = React.useState<{ id: string; deal: NegocioKanban; etapa: EtapaDaPrevia } | null>(null);
  const [dragging, setDragging] = React.useState<{ deal: NegocioKanban; tipo: string; prazo?: number | null } | null>(null);
  // Relógio da tela: muda só quando os dados chegam (tempo na etapa, atrasos).
  const [agora, setAgora] = React.useState(() => new Date());
  const buscaRef = React.useRef<HTMLInputElement>(null);
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
    () => aplicarVisao(montarFiltro(estado, BARRA_DE_NEGOCIOS, { hoje }), estado.visao, opcoes.meuId, hoje),
    [estado, opcoes.meuId, hoje]
  );
  const chaveDoQuadro = React.useMemo(() => JSON.stringify({ pipelineId, filtro }), [pipelineId, filtro]);
  const chaveAtrasada = useComAtraso(chaveDoQuadro, 250);
  const pronto = !!pipelineId && (opcoes.carregado || estado.visao !== "meus");

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

  // ── Contagens das abas (visão sozinha, sem a barra) ──
  React.useEffect(() => {
    if (!pipelineId || !opcoes.carregado) return;
    let vivo = true;
    Promise.all(
      VISOES_DE_NEGOCIO.map((v) =>
        fetch("/api/deals/busca", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filtro: aplicarVisao({ logica: "e", grupos: [] }, v.id, opcoes.meuId, hoje).filtro, pipeline: pipelineId, apenasTotal: true }),
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
  }, [pipelineId, opcoes.carregado, opcoes.meuId, hoje, versao]);

  // ── Colunas recolhidas (por usuário e funil; visão salva na L4) ──
  const idsDasEtapas = React.useMemo(() => stages.map((s) => s.id), [stages]);
  const validarRecolhidas = React.useCallback((bruto: string | null) => colunasValidas(bruto, idsDasEtapas, []), [idsDasEtapas]);
  const [recolhidas, gravarRecolhidas] = useListaSalva(`eva:recolhidas:negocios:${contrato ?? "-"}:${opcoes.meuId || "-"}:${pipelineId}`, validarRecolhidas);
  const tudoRecolhido = stages.length > 0 && recolhidas.length === stages.length;

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
  const [recadoDispensado, setRecadoDispensado] = usePreferencia<string>("eva:negocios:recado", "", [hoje]);
  const recado = React.useMemo(
    () => (carregando || !eva ? null : montarRecado(stages, agora, opcoes.meuNome, gargaloDaConversao(conversao))),
    [carregando, eva, stages, agora, conversao, opcoes.meuNome]
  );
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
  function aoAcaoDoRecado(id: AcaoDoRecado) {
    if (id === "novo") return setNovoNaEtapa("");
    if (id === "gargalo") {
      const g = gargaloDaConversao(conversao);
      const coluna = g && [...document.querySelectorAll<HTMLElement>("[data-etapa]")].find((el) => el.dataset.etapa === g.de);
      coluna?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
      return;
    }
    // Retornos, não lidas e parados caem todos em "Precisam de atenção".
    setEstado({ ...estado, visao: "atencao", pagina: 1 });
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
  const mudanca = useMudancaDeEtapa({ onErro: (m) => setErro(m) });
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
    const r = await mudanca.mover({ dealId, nome: deal.name, pipelineId, para, defs: quadro.defs });
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
  const descricao = quadro
    ? `${qtdAbertos.toLocaleString("pt-BR")} ${qtdAbertos === 1 ? "negócio aberto" : "negócios abertos"} · ${formatMoney(totalAberto / 100)} no funil · ${formatMoney(ponderado / 100)} ponderado`
    : undefined;

  // Exportar leva o funil e o que a exportação já entende (busca, visão, um
  // proprietário). Os demais filtros da barra ainda não (ver plano, L5).
  const consultaDeExportacao = React.useMemo(() => {
    const p = new URLSearchParams();
    if (pipelineId) p.set("pipeline", pipelineId);
    if (estado.busca.trim()) p.set("busca", estado.busca.trim());
    const donos = estado.listas.responsavel ?? [];
    if (donos.length === 1) p.set("dono", donos[0] === SEM_VALOR ? "__sem" : donos[0]);
    if (estado.visao !== "todos") p.set("visao", estado.visao);
    return p.toString();
  }, [pipelineId, estado.busca, estado.listas.responsavel, estado.visao]);

  const linkDeAcao = cn(buttonVariants({ variant: "ghost" }), "h-8 w-8 px-0");

  return (
    <div className="flex min-h-0 flex-col gap-3">
      <PageHeader
        title="Negócios"
        description={descricao}
        actions={
          <>
            {pipelines.length > 1 && (
              <Select aria-label="Funil" value={pipelineId} onChange={(e) => (setPrevia(null), gravarParametro("funil", e.target.value))} className="w-48">
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary">
                  <Download size={14} aria-hidden="true" />
                  Exportar
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64">
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
                <DropdownMenuLabel>Leva o funil, a busca, a visão e um proprietário.</DropdownMenuLabel>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="secondary" onClick={() => setImportando(true)} disabled={!pipeline}>
              <Upload size={14} aria-hidden="true" />
              Importar
            </Button>
            <Button variant="primary" onClick={() => setNovoNaEtapa("")} title="Criar negócio (N)">
              <Plus size={14} aria-hidden="true" />
              Criar negócio
            </Button>
          </>
        }
      />

      {eva && recado && recadoDispensado !== hoje && (
        <RecadoDaEva recado={recado} carimbo={carimbo(agora)} onAcao={aoAcaoDoRecado} onDispensar={() => setRecadoDispensado(hoje)} />
      )}
      {eva && <Momentos itens={momentosDoFunil} />}
      {estilo === "v3" && !carregando && (
        <DiaDeHoje
          acontecimentos={acontecimentosDoDia}
          atencao={atencaoDoDia.slice(0, 4)}
          total={atencaoDoDia.length}
          onAcao={aoAcaoDaAtencao}
          onVerTodos={() => setEstado({ ...estado, visao: "atencao", pagina: 1 })}
        />
      )}

      <ViewTabs
        label="Visões de negócios"
        value={estado.visao}
        onChange={(v) => setEstado({ ...estado, visao: v, pagina: 1 })}
        views={VISOES_DE_NEGOCIO.map((v) => ({ id: v.id, label: v.label, count: contagens[v.id] }))}
      />

      <BarraDeFiltros
        rotulo="Filtros de negócios"
        barra={BARRA_DE_NEGOCIOS}
        estado={estado}
        onEstado={setEstado}
        opcoes={barraOpcoes}
        buscaDeOpcoes={{ contato: buscarContatos }}
        editor={editor}
        end={
          <>
            <SearchInput
              ref={buscaRef}
              aria-label="Buscar negócios"
              placeholder="Buscar por nome"
              value={estado.busca}
              onValueChange={(q) => setEstado({ ...estado, busca: q, pagina: 1 })}
              className="w-56"
            />
            {modo === "kanban" ? (
              <Button variant="ghost" onClick={() => gravarRecolhidas(tudoRecolhido ? [] : idsDasEtapas)} disabled={!stages.length}>
                {tudoRecolhido ? <ChevronsLeftRight size={14} aria-hidden="true" /> : <ChevronsRightLeft size={14} aria-hidden="true" />}
                {tudoRecolhido ? "Expandir tudo" : "Recolher tudo"}
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setEditandoColunas(true)}>
                <Columns3 size={14} aria-hidden="true" />
                Editar colunas
              </Button>
            )}
            <Link
              href={`/negocios/configurar?aba=cartao${pipelineId ? `&funil=${pipelineId}` : ""}`}
              aria-label="Configurar o cartão, os funis e os campos"
              title="Configurar o cartão, os funis e os campos"
              className={linkDeAcao}
            >
              <Settings size={16} aria-hidden="true" />
            </Link>
            <LegendaDoQuadro />
            <SeletorDeEstilo estilo={estilo} onMudar={setEstilo} />
          </>
        }
      />

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
          chaveDasColunas={chaveDasColunas("negocios", contrato, opcoes.meuId)}
          editandoColunas={editandoColunas}
          onEditandoColunas={setEditandoColunas}
          onAbrir={abrirDaLista}
        />
      ) : !quadro ? (
        <div className="flex gap-2 overflow-hidden" aria-busy="true" aria-label="Carregando negócios">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-96 w-72 shrink-0 rounded-lg" />
          ))}
        </div>
      ) : (
        <VozDoQuadro.Provider value={estilo === "v2" || estilo === "v3"}>
          <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setDragging(null)}>
            <div className="relative">
              <div className="flex min-h-96 snap-x gap-2 overflow-x-auto pb-3 [max-height:calc(100dvh-260px)]">
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
          onClose={() => setNovoNaEtapa(null)}
          onCreated={() => {
            setNovoNaEtapa(null);
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
