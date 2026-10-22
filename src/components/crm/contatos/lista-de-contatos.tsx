"use client";

import * as React from "react";
import { Columns3, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { montarFiltro, type FiltroDaBarra } from "@/lib/listas/estado-da-lista";
import { clampPage } from "@/lib/design-system/pagination";
import { formatRelativeDate } from "@/lib/utils";
import { CHANNEL_LABEL, SOURCE_LABEL, nomeDoContato, type Contact } from "./tipos";

// ---------------------------------------------------------------------------
// Lista de contatos no padrão de CRM de mercado: abas de visão com contagem,
// barra de filtros em linha, busca, Exportar/Importar, Editar colunas,
// tabela ordenável no servidor com seleção e paginação numerada. Estado na
// URL (link compartilhável); visões salvas nas abas (L4) e ações em massa na
// seleção (L5). Colunas: da visão salva; nas de sistema, do navegador.
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
  { id: "todos", label: "Todos os contatos" },
  { id: "meus", label: "Meus contatos" },
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
}: {
  opcoes: OpcoesDoCrm;
  /** Muda quando algo foi criado/alterado fora (recarrega lista e contagens). */
  versao: number;
  onAbrir: (c: Contact) => void;
  onCriar: () => void;
  onImportar: () => void;
}) {
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
              <Avatar name={nomeDoContato(c)} size="sm" />
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
                <Avatar name={c.owner.name || "Sem nome"} size="sm" />
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
        ...(estado.ordem ? { sort: ORDENA_POR[estado.ordem.key] ?? estado.ordem.key, dir: estado.ordem.direction } : {}),
        page: estado.pagina,
        pageSize: estado.tamanho,
      }),
    [filtro, estado.ordem, estado.pagina, estado.tamanho]
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
    if (estado.ordem) {
      p.set("sort", ORDENA_POR[estado.ordem.key] ?? estado.ordem.key);
      p.set("dir", estado.ordem.direction);
    }
    return apiDoContrato(contrato, `/api/contacts/exportar?${p}`);
  }, [filtro, estado.ordem, contrato]);

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

  return (
    <div className="flex flex-col gap-3">
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

      <BarraDeFiltros
        rotulo="Filtros de contatos"
        barra={BARRA_DE_CONTATOS}
        estado={estado}
        onEstado={setEstado}
        opcoes={barraOpcoes}
        editor={editor}
        end={
          <>
            <SearchInput
              aria-label="Buscar contatos"
              placeholder="Buscar nome, e-mail ou telefone"
              value={estado.busca}
              onValueChange={(q) => setEstado({ ...estado, busca: q, pagina: 1 })}
              className="w-64"
            />
            <Button variant="ghost" size="md" onClick={() => setEditandoColunas(true)}>
              <Columns3 size={14} aria-hidden="true" />
              Editar colunas
            </Button>
            <Button variant="secondary" size="md" onClick={onImportar}>
              <Upload size={14} aria-hidden="true" />
              Importar
            </Button>
            <a
              href={exportarHref}
              download
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-panel px-3 text-body font-medium text-text-primary transition-colors duration-120 hover:border-border-strong hover:bg-raised"
              title="Exporta os contatos com os filtros e a ordem atuais"
            >
              <Download size={14} aria-hidden="true" />
              Exportar
            </a>
          </>
        }
      />

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

      <div className="overflow-hidden rounded-lg border border-border-subtle bg-panel">
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
          empty={
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
                    Criar contato
                  </Button>
                ) : undefined
              }
            />
          }
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

/** "cf:" salvos (mantidos enquanto as definições ainda não carregaram). */
function colunasSalvasCf(bruto: string | null): string[] {
  try {
    const v = JSON.parse(bruto ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.startsWith("cf:")) : [];
  } catch {
    return [];
  }
}
