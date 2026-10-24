"use client";

import { urlDoAvatar } from "@/lib/avatar";
import * as React from "react";
import { CalendarClock, ChevronLeft, ChevronRight, Columns3, Download, List, ListFilter, Table2, Upload } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { focusRing } from "@/components/ui/styles";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Notice } from "@/components/ui/notice";
import { PhoneNumber } from "@/components/ui/phone-number";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { ColumnPicker, type ColumnOption } from "@/components/ui/column-picker";
import { BarraDeFiltros } from "@/components/crm/listas/barra-de-filtros";
import { useComAtraso, useEstadoDaLista } from "@/components/crm/listas/use-estado-da-lista";
import { useListaSalva } from "@/components/crm/listas/use-lista-salva";
import { opcoesDaBarra, opcoesDoEditor, opcoesExtrasDoEditor, type OpcoesDoCrm } from "@/components/crm/listas/use-opcoes-do-crm";
import { useContrato } from "@/lib/contrato/navegacao";
import { apiDoContrato } from "@/lib/contrato/rotas";
import { SEM_VALOR, type FiltroDeConsulta } from "@/lib/consulta";
import { CAMPOS_DE_CONTATO, type FiltroCrm } from "@/lib/filtro-crm";
import { AbasDeVisoes, CamposRemovidos, useVisoesDaLista, type VisaoDeSistema } from "@/components/crm/listas/visoes-salvas";
import { AcoesEmMassaDeContatos, SELECAO_VAZIA, type Selecao } from "@/components/crm/listas/acoes-em-massa";
import { camposRemovidos, configDoEstado, estadoDaConfig, semCamposRemovidos } from "@/lib/visoes/visoes";
import { formatarValor } from "@/lib/custom-fields";
import { chaveDasColunas, colunasValidas } from "@/lib/listas/colunas";
import { filtrandoAlgo, montarFiltro, totalAvancado, type EstadoDaLista, type FiltroDaBarra } from "@/lib/listas/estado-da-lista";
import { clampPage } from "@/lib/design-system/pagination";
import { cn, formatRelativeDate } from "@/lib/utils";
import { CHANNEL_LABEL, SOURCE_LABEL, nomeDoContato, type Contact } from "./tipos";
import { CabecalhoDeContatos, type AbaDeContatos } from "./cabecalho";
import { FotoDoContato } from "./foto-do-contato";
import { MOLA } from "@/lib/design-system/movimento";

// ---------------------------------------------------------------------------
// Lista de contatos: visões salvas em cápsula com contagem, busca + "Filtros"
// (os filtros da barra moram dentro), e duas formas de ver o mesmo resultado
// do servidor. "Lista" (padrão): coluna de pessoas com foto e seções por
// letra, e o painel ao lado (próximas atividades ou a ficha). "Tabela":
// ordenável no servidor, com seleção, ações em massa e paginação numerada.
// Estado na URL (link compartilhável); colunas da visão salva ou do navegador.
// Importar, Exportar e Editar colunas ficam no "…" do cabeçalho.
// ---------------------------------------------------------------------------

export const BARRA_DE_CONTATOS: FiltroDaBarra[] = [
  { campo: "responsavel", rotulo: "Proprietário", param: "dono", tipo: "lista" },
  { campo: "equipe", rotulo: "Equipes", param: "equipe", tipo: "lista" },
  { campo: "empresa", rotulo: "Empresas", param: "empresa", tipo: "lista" },
  { campo: "etiqueta", rotulo: "Etiquetas", param: "etiqueta", tipo: "lista" },
  { campo: "criadoEm", rotulo: "Criado em", param: "criado", tipo: "data" },
  { campo: "ultimaAtividade", rotulo: "Última atividade", param: "atividade", tipo: "data" },
];

const VISOES: VisaoDeSistema[] = [
  { id: "todos", label: "Todos" },
  { id: "meus", label: "Meus" },
  { id: "sem-dono", label: "Sem proprietário" },
];
const IDS_DAS_VISOES = VISOES.map((v) => v.id);
const PADRAO = { visao: "todos", tamanho: 25 };

function condicoesDaVisao(visao: string, meuId: string): FiltroDeConsulta[] {
  if (visao === "meus") return [{ campo: "responsavel", op: "qualquer", valores: [meuId || "__ninguem"] }];
  if (visao === "sem-dono") return [{ campo: "responsavel", op: "qualquer", valores: [SEM_VALOR] }];
  return [];
}

/** Coluna da tabela → campo de ordenação do servidor (ORDENACOES.contatos). */
const ORDENA_POR: Record<string, string> = {
  nome: "nome",
  email: "email",
  responsavel: "responsavel",
  celular: "telefone",
  empresa: "empresa",
  ultimaAtividade: "ultimaAtividade",
  criadoEm: "criadoEm",
};

const COLUNAS_PADRAO = ["nome", "email", "responsavel", "celular", "empresa", "etiquetas", "ultimaAtividade", "criadoEm"];
const FIXAS = ["nome"];

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const vazio = <span className="text-text-tertiary">—</span>;

function primeiroTelefone(phones: unknown): string {
  if (!Array.isArray(phones)) return "";
  const p = phones.find((x) => x && typeof x === "object" && typeof (x as { value?: unknown }).value === "string");
  return p ? String((p as { value: string }).value) : "";
}

export type VistaDaLista = "lista" | "tabela";

// Na Lista sem ordem escolhida, A–Z por nome (as seções por letra dependem disso).
const ORDEM_DA_LISTA = { key: "nome", direction: "asc" } as const;

/** Letra da seção: primeira letra sem acento; o que não é letra vai para "#". */
function letraDe(nome: string): string {
  const l = nome.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").charAt(0).toUpperCase();
  return /[A-Z]/.test(l) ? l : "#";
}

/** Quantos filtros estão valendo (o número do botão "Filtros"). */
function filtrosAtivos(e: EstadoDaLista): number {
  return Object.values(e.listas).filter((v) => v.length > 0).length + Object.keys(e.datas).length + totalAvancado(e);
}

const numero = new Intl.NumberFormat("pt-BR");

interface Resposta {
  total: number;
  contacts: Contact[];
  avisos: string[];
  truncado: boolean;
}

export function ListaDeContatos({
  opcoes,
  versao,
  onAbrir,
  onCriar,
  onImportar,
  aba,
  onAba,
  vista,
  onVista,
  abertoId,
  painel,
  atividadesAbertas,
  onAtividades,
}: {
  opcoes: OpcoesDoCrm;
  /** Muda quando algo foi criado/alterado fora (recarrega lista e contagens). */
  versao: number;
  onAbrir: (c: Contact) => void;
  onCriar: () => void;
  onImportar: () => void;
  aba: AbaDeContatos;
  onAba: (a: AbaDeContatos) => void;
  vista: VistaDaLista;
  onVista: (v: VistaDaLista) => void;
  /** Contato com a ficha aberta (destacado na Lista). */
  abertoId: string | null;
  /** Painel à direita da Lista (próximas atividades ou a ficha); null = fechado, a lista ocupa a largura. */
  painel: React.ReactNode | null;
  /** Botão "Atividades" da Lista: abre/fecha as próximas atividades no painel. */
  atividadesAbertas: boolean;
  onAtividades: () => void;
}) {
  const calmo = useReducedMotion();
  const contrato = useContrato();
  const visoes = useVisoesDaLista("contatos", VISOES, PADRAO);
  const padrao = React.useMemo(() => ({ ...PADRAO, visao: visoes.padrao }), [visoes.padrao]);
  const [estado, setEstado] = useEstadoDaLista(BARRA_DE_CONTATOS, padrao, { visoes: IDS_DAS_VISOES, baseDaVisao: visoes.baseDaVisao });
  const visaoSalva = visoes.salva(estado.visao);
  // Condições de sistema da aba ("Meus" = de quem olha), também numa visão salva.
  const visaoBase = visoes.visaoBase(estado.visao);
  const [dados, setDados] = React.useState<Resposta | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState<string | null>(null);
  const [contagens, setContagens] = React.useState<Record<string, number>>({});
  const [selecao, setSelecao] = React.useState<Selecao>(SELECAO_VAZIA);
  const [recarga, setRecarga] = React.useState(0);
  const [editandoColunas, setEditandoColunas] = React.useState(false);
  // Os filtros moram no botão "Filtros"; já abre aberto se o link trouxe filtro.
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(() => filtrosAtivos(estado) > 0);
  const ordem = estado.ordem ?? (vista === "lista" ? ORDEM_DA_LISTA : null);

  // ── Colunas ──
  const defs = opcoes.campos;
  const disponiveis: (ColumnOption & { coluna: DataTableColumn<Contact> })[] = React.useMemo(() => {
    const base: (ColumnOption & { coluna: DataTableColumn<Contact> })[] = [
      {
        id: "nome",
        label: "Nome",
        group: "Contato",
        coluna: {
          key: "nome",
          header: "Nome",
          sortable: true,
          width: "240px",
          cell: (c) => (
            <span className="flex min-w-0 items-center gap-2">
              <Avatar name={nomeDoContato(c)} size="sm" src={urlDoAvatar(c.avatarPath)} />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onAbrir(c);
                }}
                className="truncate font-medium text-text-primary hover:text-accent-fg hover:underline"
              >
                {nomeDoContato(c)}
              </button>
            </span>
          ),
        },
      },
      { id: "email", label: "E-mail", group: "Contato", coluna: { key: "email", header: "E-mail", sortable: true, width: "230px", cell: (c) => (c.email ? <span className="text-text-secondary">{c.email}</span> : vazio) } },
      {
        id: "responsavel",
        label: "Proprietário",
        group: "Contato",
        coluna: {
          key: "responsavel",
          header: "Proprietário",
          sortable: true,
          width: "170px",
          cell: (c) =>
            c.owner ? (
              <span className="flex items-center gap-1.5">
                <Avatar name={c.owner.name || "Sem nome"} size="sm" src={urlDoAvatar(c.owner.avatarPath)} />
                <span className="truncate">{c.owner.name || "Sem nome"}</span>
              </span>
            ) : (
              vazio
            ),
        },
      },
      { id: "celular", label: "Celular", group: "Contato", coluna: { key: "celular", header: "Celular", sortable: true, width: "190px", cell: (c) => <PhoneNumber value={c.phone} className="text-text-secondary" whatsapp /> } },
      { id: "telefone", label: "Telefone", group: "Contato", coluna: { key: "telefone", header: "Telefone", width: "190px", cell: (c) => <PhoneNumber value={primeiroTelefone(c.phones)} className="text-text-secondary" /> } },
      { id: "empresa", label: "Empresa", group: "Contato", coluna: { key: "empresa", header: "Empresa", sortable: true, width: "180px", cell: (c) => c.company?.name ?? vazio } },
      { id: "cargo", label: "Cargo", group: "Contato", coluna: { key: "cargo", header: "Cargo", width: "160px", cell: (c) => c.jobTitle || vazio } },
      {
        id: "etiquetas",
        label: "Etiquetas",
        group: "Contato",
        coluna: {
          key: "etiquetas",
          header: "Etiquetas",
          width: "200px",
          cell: (c) =>
            c.tags.length === 0 ? (
              vazio
            ) : (
              <span className="flex items-center gap-1">
                {c.tags.slice(0, 2).map((t) => (
                  <Badge key={t.id}>{t.name}</Badge>
                ))}
                {c.tags.length > 2 && <span className="text-caption text-text-tertiary">+{c.tags.length - 2}</span>}
              </span>
            ),
        },
      },
      {
        id: "canais",
        label: "Canais",
        group: "Contato",
        coluna: {
          key: "canais",
          header: "Canais",
          width: "170px",
          cell: (c) =>
            c.channels.length === 0 ? vazio : <span className="text-text-secondary">{[...new Set(c.channels.map((ch) => CHANNEL_LABEL[ch.channel] ?? ch.channel))].join(", ")}</span>,
        },
      },
      { id: "origem", label: "Origem", group: "Contato", coluna: { key: "origem", header: "Origem", width: "120px", cell: (c) => <span className="text-text-secondary">{SOURCE_LABEL[c.source] ?? c.source}</span> } },
      {
        id: "optIn",
        label: "Aceita mensagens",
        group: "Contato",
        coluna: { key: "optIn", header: "Aceita mensagens", width: "140px", cell: (c) => (c.optIn ? <span className="text-text-secondary">Sim</span> : <Badge variant="warning">Saiu da lista</Badge>) },
      },
      {
        id: "ultimaAtividade",
        label: "Última atividade",
        group: "Datas",
        coluna: { key: "ultimaAtividade", header: "Última atividade", sortable: true, width: "150px", cell: (c) => <span className="text-text-secondary">{formatRelativeDate(c.lastSeenAt)}</span> },
      },
      { id: "criadoEm", label: "Criado em", group: "Datas", coluna: { key: "criadoEm", header: "Criado em", sortable: true, width: "120px", cell: (c) => <span className="tabular-nums text-text-secondary">{dataCurta(c.createdAt)}</span> } },
    ];
    const personalizados = defs.map((d) => ({
      id: `cf:${d.key}`,
      label: d.label,
      group: "Campos personalizados",
      coluna: {
        key: `cf:${d.key}`,
        header: d.label,
        width: "160px",
        numeric: d.type === "number" || d.type === "currency",
        cell: (c: Contact) => formatarValor(d, c.customFields?.[d.key]) || vazio,
      } satisfies DataTableColumn<Contact>,
    }));
    return [...base, ...personalizados];
  }, [defs, onAbrir]);

  const idsDisponiveis = React.useMemo(() => disponiveis.map((d) => d.id), [disponiveis]);
  // Até os campos personalizados chegarem, não descarta "cf:" salvo.
  const validar = React.useCallback(
    (bruto: string | null) => colunasValidas(bruto, opcoes.carregado ? idsDisponiveis : [...idsDisponiveis, ...colunasSalvasCf(bruto)], COLUNAS_PADRAO, FIXAS),
    [idsDisponiveis, opcoes.carregado]
  );
  // Colunas: as da visão salva (ou o ajuste não salvo dela, na URL); nas de
  // sistema (e sem visões no banco), as do navegador, como antes.
  const [colunasDoNavegador, gravarColunas] = useListaSalva(chaveDasColunas("contatos", contrato, opcoes.meuId), validar);
  const colunasDaVisao = React.useMemo(() => (estado.colunas ? validar(JSON.stringify(estado.colunas)) : null), [estado.colunas, validar]);
  const colunasEscolhidas = colunasDaVisao ?? colunasDoNavegador;
  const mudarColunas = (ids: string[]) => (visaoSalva ? setEstado({ ...estado, colunas: ids }) : gravarColunas(ids));
  const porId = new Map(disponiveis.map((d) => [d.id, d.coluna]));
  const colunas = colunasEscolhidas.map((id) => porId.get(id)).filter((c): c is DataTableColumn<Contact> => !!c);

  // ── Busca no servidor ──
  const filtro = React.useMemo(
    () => montarFiltro(estado, BARRA_DE_CONTATOS, { daVisao: condicoesDaVisao(visaoBase, opcoes.meuId) }),
    [estado, visaoBase, opcoes.meuId]
  );
  // Filtro mudou: a seleção (sobretudo "todos os N") deixa de valer.
  const chaveDoFiltro = JSON.stringify(filtro);
  const [filtroDaSelecao, setFiltroDaSelecao] = React.useState(chaveDoFiltro);
  if (filtroDaSelecao !== chaveDoFiltro) {
    setFiltroDaSelecao(chaveDoFiltro);
    setSelecao(SELECAO_VAZIA);
  }
  const corpo = React.useMemo(
    () =>
      JSON.stringify({
        filtro,
        ...(ordem ? { sort: ORDENA_POR[ordem.key] ?? ordem.key, dir: ordem.direction } : {}),
        page: estado.pagina,
        pageSize: estado.tamanho,
      }),
    [filtro, ordem, estado.pagina, estado.tamanho]
  );
  // A busca digitada espera o fim da digitação; o resto vai na hora.
  const corpoAtrasado = useComAtraso(corpo, 250);
  // Espera as visões (a padrão da pessoa decide o que a URL sem ?v= mostra).
  const pronto = visoes.carregado && (opcoes.carregado || visaoBase !== "meus");

  const ultima = React.useRef(0);
  React.useEffect(() => {
    if (!pronto) return;
    const n = ++ultima.current;
    let vivo = true;
    fetch("/api/contacts/busca", { method: "POST", headers: { "Content-Type": "application/json" }, body: corpoAtrasado })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "Não foi possível carregar os contatos.");
        return d as Resposta;
      })
      .then((d) => {
        if (!vivo || n !== ultima.current) return;
        setDados(d);
        setErro(null);
      })
      .catch((e: Error) => vivo && n === ultima.current && setErro(e.message))
      .finally(() => vivo && n === ultima.current && setCarregando(false));
    return () => {
      vivo = false;
    };
  }, [corpoAtrasado, pronto, versao, recarga]);

  // Contagem de cada aba, ao vivo e pelo mesmo motor: de sistema = só a
  // condição da visão; salva = o filtro guardado nela.
  const filtrosDasAbas = React.useMemo(
    () => [
      ...VISOES.map((v) => ({ id: v.id, filtro: { logica: "e", grupos: [], rapidos: condicoesDaVisao(v.id, opcoes.meuId) } as FiltroCrm })),
      ...visoes.visoes.map((v) => ({
        id: v.id,
        filtro: montarFiltro(estadoDaConfig(v.config, PADRAO, v.id), BARRA_DE_CONTATOS, { daVisao: condicoesDaVisao(v.config.visaoBase, opcoes.meuId) }),
      })),
    ],
    [visoes.visoes, opcoes.meuId]
  );
  React.useEffect(() => {
    if (!opcoes.carregado) return;
    let vivo = true;
    Promise.all(
      filtrosDasAbas.map((v) =>
        fetch("/api/contacts/busca", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filtro: v.filtro, apenasTotal: true }),
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
  }, [opcoes.carregado, filtrosDasAbas, versao, recarga]);

  const total = dados?.total ?? 0;
  const linhas = dados?.contacts ?? [];
  const carregandoAgora = carregando || corpo !== corpoAtrasado;

  const exportarHref = React.useMemo(() => {
    const p = new URLSearchParams({ filtro: JSON.stringify(filtro) });
    if (ordem) {
      p.set("sort", ORDENA_POR[ordem.key] ?? ordem.key);
      p.set("dir", ordem.direction);
    }
    return apiDoContrato(contrato, `/api/contacts/exportar?${p}`);
  }, [filtro, ordem, contrato]);

  const barraOpcoes = React.useMemo(() => opcoesDaBarra(opcoes), [opcoes]);
  const editor = React.useMemo(
    () => ({
      catalogo: CAMPOS_DE_CONTATO,
      opcoes: opcoesDoEditor(opcoes),
      extras: opcoesExtrasDoEditor(opcoes),
      campoInicialId: "etiqueta",
      entidade: "contatos",
    }),
    [opcoes]
  );

  // Filtro em campo que não existe mais: chip "campo removido" (o motor já ignora).
  const removidos = React.useMemo(
    () => (opcoes.carregado ? camposRemovidos(estado.avancado, "contatos", opcoes.campos.map((c) => c.key)) : []),
    [opcoes.carregado, opcoes.campos, estado.avancado]
  );
  const configAtual = () => configDoEstado(estado, { visaoBase, colunas: colunasEscolhidas });
  const paginaToda = linhas.length > 0 && linhas.every((c) => selecao.ids.has(c.id));
  const aoAgirEmMassa = () => {
    setSelecao(SELECAO_VAZIA);
    setRecarga((r) => r + 1);
  };

  const nFiltros = filtrosAtivos(estado);
  const vazioDaLista = (
    <EmptyState
      compact
      title={estado.busca || total === 0 ? "Nenhum contato encontrado" : "Nada nesta página"}
      description={
        contagens.todos === 0
          ? "Os contatos aparecem sozinhos quando alguém conversa com o agente. Você também pode criar ou importar."
          : "Nenhum contato bate com os filtros. Tire algum filtro ou mude a visão."
      }
      action={
        contagens.todos === 0 ? (
          <Button variant="primary" onClick={onCriar}>
            Novo contato
          </Button>
        ) : undefined
      }
    />
  );

  return (
    <div className={cn("flex flex-col gap-4", vista === "lista" && "min-h-0 flex-1")}>
      <CabecalhoDeContatos
        rotulo={dados ? `${numero.format(total)} ${filtrandoAlgo(estado) ? (total === 1 ? "encontrado" : "encontrados") : "no total"}` : undefined}
        aba={aba}
        onAba={onAba}
        onNovo={onCriar}
        menu={
          <>
            <DropdownMenuItem onSelect={onImportar}>
              <Upload aria-hidden="true" /> Importar
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <a href={exportarHref} download title="Exporta os contatos com os filtros e a ordem atuais">
                <Download aria-hidden="true" /> Exportar
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => {
                // Colunas são da tabela: mostra a tabela para ver o efeito.
                onVista("tabela");
                setEditandoColunas(true);
              }}
            >
              <Columns3 aria-hidden="true" /> Editar colunas
            </DropdownMenuItem>
          </>
        }
      />

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
          {/* Abas de visão em cápsula: o ViewTabs é sublinhado; aqui ele vira pílula. */}
          <div
            className={cn(
              "min-w-0 flex-1",
              "[&>div>div:first-child]:items-center [&>div>div:first-child]:border-b-0",
              "[&_[role=tablist]]:items-center [&_[role=tablist]]:gap-1",
              "[&_[role=tab]]:mb-0 [&_[role=tab]]:h-8 [&_[role=tab]]:rounded-full [&_[role=tab]]:border-0 [&_[role=tab]]:px-3 [&_[role=tab]]:text-small",
              "[&_[role=tab][aria-selected=true]]:bg-raised [&_[role=tab][aria-selected=true]]:ring-1 [&_[role=tab][aria-selected=true]]:ring-border-subtle",
              "[&_[role=tab]:hover]:bg-hover [&_[role=tablist]>span>span]:mb-0 [&>div>div:first-child>button]:mb-0"
            )}
          >
            <AbasDeVisoes
              rotulo="Visões de contatos"
              sistema={VISOES}
              visoes={visoes}
              estado={estado}
              onEstado={setEstado}
              barra={BARRA_DE_CONTATOS}
              contagens={contagens}
              configAtual={configAtual}
              equipes={opcoes.equipes}
              padraoDaLista={PADRAO}
            />
          </div>
          <div className="flex items-center gap-2">
            <SearchInput
              aria-label="Buscar contatos"
              placeholder="Buscar nome, e-mail ou telefone"
              value={estado.busca}
              onValueChange={(q) => setEstado({ ...estado, busca: q, pagina: 1 })}
              className="w-56"
            />
            <Button variant="secondary" aria-expanded={filtrosAbertos} aria-controls="filtros-de-contatos" onClick={() => setFiltrosAbertos((v) => !v)}>
              <ListFilter size={14} aria-hidden="true" />
              Filtros
              {nFiltros > 0 && (
                <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-accent-solid px-1 text-caption tabular-nums text-text-on-accent">{nFiltros}</span>
              )}
            </Button>
            {vista === "lista" && (
              <Button variant="secondary" aria-pressed={atividadesAbertas} onClick={onAtividades} className={cn(atividadesAbertas && "bg-raised ring-1 ring-border-strong")}>
                <CalendarClock size={14} aria-hidden="true" />
                Atividades
              </Button>
            )}
            <SeletorDeVista value={vista} onChange={onVista} />
          </div>
        </div>

        {filtrosAbertos && (
          <div id="filtros-de-contatos" className="rounded-[18px] border border-border-subtle bg-panel px-3 py-1.5">
            <BarraDeFiltros
              rotulo="Filtros de contatos"
              barra={BARRA_DE_CONTATOS}
              estado={estado}
              onEstado={setEstado}
              opcoes={barraOpcoes}
              editor={editor}
            />
          </div>
        )}
      </div>

      {erro && (
        <Notice tone="danger" onDismiss={() => setErro(null)}>
          {erro}
        </Notice>
      )}
      {dados && dados.avisos.length > 0 && <Notice tone="warning">{dados.avisos.join(" ")}</Notice>}
      {dados?.truncado && (
        <Notice tone="warning">Um filtro por campo personalizado de número ou data olhou só os primeiros 5.000 contatos; a lista pode estar incompleta.</Notice>
      )}

      {removidos.length > 0 && <CamposRemovidos removidos={removidos} onTirar={() => setEstado({ ...estado, avancado: semCamposRemovidos(estado.avancado, removidos.map((r) => r.campo)), pagina: 1 })} />}

      {vista === "lista" ? (
        <div className="flex min-h-96 flex-1 gap-4">
          {/* Sem nada aberto a lista ocupa a largura (linhas com celular, e-mail,
              etiquetas…); a ficha ou as atividades só abrem quando pedidas. */}
          <div className={cn("flex min-h-0 w-full flex-col", painel && "lg:w-[360px] lg:shrink-0")}>
            <div className="min-h-0 flex-1 overflow-y-auto pr-1">
              {carregandoAgora && !dados ? (
                <div role="status" aria-label="Carregando contatos" className="flex flex-col">
                  {Array.from({ length: 8 }, (_, i) => (
                    <span key={i} className="flex h-14.5 items-center gap-3 border-b border-border-subtle px-2">
                      <span className="size-9.5 animate-pulse rounded-full bg-raised motion-reduce:animate-none" />
                      <span className="h-3 w-40 animate-pulse rounded bg-raised motion-reduce:animate-none" />
                    </span>
                  ))}
                </div>
              ) : linhas.length === 0 ? (
                vazioDaLista
              ) : (
                <ListaDePessoas contatos={linhas} porLetra={ordem?.key === "nome"} abertoId={abertoId} onAbrir={onAbrir} larga={!painel} />
              )}
            </div>
            <PaginacaoCompacta pagina={estado.pagina} tamanho={estado.tamanho} total={total} onPagina={(p) => setEstado({ ...estado, pagina: p })} />
          </div>
          {painel && (
            <motion.div
              className="hidden min-w-0 flex-1 lg:block"
              initial={calmo ? { opacity: 0 } : { opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              transition={MOLA}
            >
              {painel}
            </motion.div>
          )}
        </div>
      ) : (
        <>
          <AcoesEmMassaDeContatos
            selecao={selecao}
            onSelecao={setSelecao}
            total={total}
            paginaToda={paginaToda}
            filtro={filtro}
            membros={opcoes.dash.membros}
            etiquetas={opcoes.dash.etiquetas}
            onFeito={aoAgirEmMassa}
          />

          <div className="overflow-hidden rounded-[18px] border border-border-subtle bg-panel">
            <DataTable
              caption="Contatos"
              columns={colunas}
              rows={linhas}
              getRowKey={(c) => c.id}
              getRowLabel={nomeDoContato}
              sort={estado.ordem}
              onSortChange={(ordem) => setEstado({ ...estado, ordem, pagina: 1 })}
              selected={selecao.ids}
              onSelectedChange={(ids) => setSelecao({ ids, todos: false })}
              loading={carregandoAgora && !dados}
              loadingRows={10}
              onRowClick={onAbrir}
              className="max-h-[calc(100dvh-320px)] min-h-80"
              empty={vazioDaLista}
            />
            <Pagination
              className="border-t border-border-subtle px-3 py-2"
              page={estado.pagina}
              pageSize={estado.tamanho}
              total={total}
              onPageChange={(p) => setEstado({ ...estado, pagina: p })}
              onPageSizeChange={(t) => setEstado({ ...estado, tamanho: t, pagina: clampPage(estado.pagina, total, t) })}
            />
          </div>
        </>
      )}

      <ColumnPicker
        open={editandoColunas}
        onOpenChange={setEditandoColunas}
        options={disponiveis}
        value={colunasEscolhidas}
        defaultValue={COLUNAS_PADRAO}
        fixed={FIXAS}
        onChange={mudarColunas}
      />
    </div>
  );
}

/** Lista estilo "Alloy": foto, nome e, embaixo, a primeira etiqueta + empresa. */
function ListaDePessoas({
  contatos,
  porLetra,
  abertoId,
  onAbrir,
  larga,
}: {
  contatos: Contact[];
  /** Seções por letra só fazem sentido em ordem de nome. */
  porLetra: boolean;
  abertoId: string | null;
  onAbrir: (c: Contact) => void;
  /** Painel fechado: a linha mostra também celular, e-mail, etiquetas, responsável e data. */
  larga: boolean;
}) {
  const secoes: { letra: string | null; itens: Contact[] }[] = [];
  for (const c of contatos) {
    const letra = porLetra ? letraDe(nomeDoContato(c)) : null;
    const ultima = secoes[secoes.length - 1];
    if (ultima && ultima.letra === letra) ultima.itens.push(c);
    else secoes.push({ letra, itens: [c] });
  }
  return (
    <div className="flex flex-col">
      {larga && (
        <div aria-hidden="true" className={cn(GRADE_LARGA, "sticky top-0 z-[1] hidden h-8 bg-page px-2 font-mono text-caption uppercase tracking-wider text-text-tertiary lg:grid")}>
          <span />
          <span>Nome</span>
          <span>Celular</span>
          <span>E-mail</span>
          <span>Etiquetas</span>
          <span>Responsável</span>
          <span className="text-right">Criado</span>
        </div>
      )}
      {secoes.map((s, i) => (
        <section key={`${s.letra ?? "_"}-${i}`} aria-label={s.letra ? `Contatos com ${s.letra}` : "Contatos"}>
          {s.letra && <h3 className="px-2 pb-1 pt-2.5 font-mono text-caption uppercase tracking-wider text-text-tertiary">{s.letra}</h3>}
          <ul>
            {s.itens.map((c) => {
              const nome = nomeDoContato(c);
              const ativo = c.id === abertoId;
              const linha2 = [c.tags[0]?.name, c.company?.name].filter(Boolean).join(" · ");
              return (
                <li key={c.id} className={cn("border-b border-border-subtle last:border-b-0", ativo && "border-transparent")}>
                  <button
                    type="button"
                    onClick={() => onAbrir(c)}
                    aria-current={ativo || undefined}
                    className={cn(
                      "grid h-14.5 w-full grid-cols-[38px_minmax(0,1fr)] items-center gap-3 rounded-xl px-2 text-left transition-[background-color,transform] duration-120 active:scale-[0.995]",
                      larga && GRADE_LARGA_LG,
                      ativo ? "bg-raised ring-1 ring-border-subtle" : "hover:bg-hover",
                      focusRing
                    )}
                  >
                    <FotoDoContato nome={nome} semente={c.id} foto={c.avatarPath} />
                    <span className="min-w-0">
                      <span className="block truncate text-body font-semibold text-text-primary">{nome}</span>
                      <span className="block truncate text-caption text-text-tertiary">
                        {larga ? linha2 || origemCurta(c) : linha2 || c.phone || c.email || origemCurta(c)}
                      </span>
                    </span>
                    {larga && (
                      <>
                        <span className="hidden min-w-0 truncate text-small text-text-secondary lg:block">{c.phone ? <PhoneNumber value={c.phone} whatsapp /> : <span className="text-text-disabled">—</span>}</span>
                        <span className="hidden min-w-0 truncate text-small text-text-secondary lg:block">{c.email || <span className="text-text-disabled">—</span>}</span>
                        <span className="hidden min-w-0 items-center gap-1 overflow-hidden lg:flex">
                          {c.tags.length ? (
                            <>
                              {c.tags.slice(0, 2).map((t) => (
                                <Badge key={t.id} variant="neutral" className="max-w-[110px] truncate">{t.name}</Badge>
                              ))}
                              {c.tags.length > 2 && <span className="font-mono text-caption text-text-tertiary">+{c.tags.length - 2}</span>}
                            </>
                          ) : (
                            <span className="text-small text-text-disabled">—</span>
                          )}
                        </span>
                        <span className="hidden min-w-0 items-center gap-2 text-small text-text-secondary lg:flex">
                          {c.owner ? (
                            <>
                              <Avatar name={c.owner.name || "Sem nome"} size="sm" src={urlDoAvatar(c.owner.avatarPath)} />
                              <span className="truncate">{c.owner.name}</span>
                            </>
                          ) : (
                            <span className="text-text-disabled">Sem responsável</span>
                          )}
                        </span>
                        <span className="hidden text-right font-mono text-caption tabular-nums text-text-tertiary lg:block">{dataCurta(c.createdAt)}</span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

// Colunas da Lista larga (painel fechado): foto, nome, celular, e-mail, etiquetas, responsável, criado.
const GRADE_LARGA = "grid-cols-[38px_minmax(180px,1.4fr)_minmax(130px,0.9fr)_minmax(160px,1.1fr)_minmax(140px,1fr)_minmax(130px,0.8fr)_84px] items-center gap-3";
const GRADE_LARGA_LG = "lg:grid-cols-[38px_minmax(180px,1.4fr)_minmax(130px,0.9fr)_minmax(160px,1.1fr)_minmax(140px,1fr)_minmax(130px,0.8fr)_84px]";

/** Sem etiqueta nem empresa: de onde o contato veio, em vez de "Sem etiqueta". */
function origemCurta(c: Contact): string {
  const origem = (SOURCE_LABEL as Record<string, string>)[c.source];
  return origem ? `Veio de ${origem.toLowerCase()}` : "Sem etiqueta";
}

/** Paginação curta da coluna da Lista (a numerada fica na Tabela). */
function PaginacaoCompacta({ pagina, tamanho, total, onPagina }: { pagina: number; tamanho: number; total: number; onPagina: (p: number) => void }) {
  if (total === 0) return null;
  const inicio = (pagina - 1) * tamanho + 1;
  const fim = Math.min(pagina * tamanho, total);
  return (
    <div className="mt-1 flex items-center justify-between border-t border-border-subtle px-2 pt-2">
      <span className="font-mono text-caption tabular-nums text-text-tertiary">
        {numero.format(inicio)}–{numero.format(fim)} de {numero.format(total)}
      </span>
      <span className="flex items-center gap-1">
        <IconButton aria-label="Página anterior" size="sm" disabled={pagina <= 1} onClick={() => onPagina(pagina - 1)}>
          <ChevronLeft aria-hidden="true" />
        </IconButton>
        <IconButton aria-label="Próxima página" size="sm" disabled={fim >= total} onClick={() => onPagina(pagina + 1)}>
          <ChevronRight aria-hidden="true" />
        </IconButton>
      </span>
    </div>
  );
}

const VISTAS: { value: VistaDaLista; rotulo: string; icone: typeof List }[] = [
  { value: "lista", rotulo: "Lista", icone: List },
  { value: "tabela", rotulo: "Tabela", icone: Table2 },
];

/** Lista | Tabela, só ícones (grupo de rádio com nome em cada opção). */
function SeletorDeVista({ value, onChange }: { value: VistaDaLista; onChange: (v: VistaDaLista) => void }) {
  return (
    <div role="radiogroup" aria-label="Forma de ver os contatos" className="inline-flex h-8 items-center gap-0.5 rounded-full bg-raised p-0.5 ring-1 ring-border-subtle">
      {VISTAS.map((v, i) => {
        const ativo = v.value === value;
        const Icone = v.icone;
        return (
          <button
            key={v.value}
            type="button"
            role="radio"
            aria-checked={ativo}
            aria-label={v.rotulo}
            title={v.rotulo}
            tabIndex={ativo ? 0 : -1}
            onClick={() => onChange(v.value)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              onChange(VISTAS[(i + 1) % VISTAS.length].value);
            }}
            className={cn(
              "grid size-7 place-items-center rounded-full transition-colors duration-120",
              ativo ? "bg-inverse text-inverse-fg" : "text-text-tertiary hover:text-text-primary",
              focusRing
            )}
          >
            <Icone size={15} aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

/** "cf:" salvos (mantidos enquanto as definições ainda não carregaram). */
function colunasSalvasCf(bruto: string | null): string[] {
  try {
    const v = JSON.parse(bruto ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.startsWith("cf:")) : [];
  } catch {
    return [];
  }
}
