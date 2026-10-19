"use client";

import * as React from "react";
import { Columns3, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ViewTabs } from "@/components/ui/view-tabs";
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
import { CAMPOS_DE_CONTATO } from "@/lib/filtro-crm";
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
// URL (link compartilhável); colunas escolhidas no navegador até a L4.
// ---------------------------------------------------------------------------

export const BARRA_DE_CONTATOS: FiltroDaBarra[] = [
  { campo: "responsavel", rotulo: "Proprietário", param: "dono", tipo: "lista" },
  { campo: "equipe", rotulo: "Equipes", param: "equipe", tipo: "lista" },
  { campo: "empresa", rotulo: "Empresas", param: "empresa", tipo: "lista" },
  { campo: "etiqueta", rotulo: "Etiquetas", param: "etiqueta", tipo: "lista" },
  { campo: "criadoEm", rotulo: "Criado em", param: "criado", tipo: "data" },
  { campo: "ultimaAtividade", rotulo: "Última atividade", param: "atividade", tipo: "data" },
];

const VISOES = [
  { id: "todos", label: "Todos os contatos" },
  { id: "meus", label: "Meus contatos" },
  { id: "sem-dono", label: "Sem proprietário" },
] as const;
const IDS_DAS_VISOES = VISOES.map((v) => v.id as string);
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
  const [estado, setEstado] = useEstadoDaLista(BARRA_DE_CONTATOS, PADRAO, IDS_DAS_VISOES);
  const [dados, setDados] = React.useState<Resposta | null>(null);
  const [carregando, setCarregando] = React.useState(true);
  const [erro, setErro] = React.useState<string | null>(null);
  const [contagens, setContagens] = React.useState<Record<string, number>>({});
  const [selecionados, setSelecionados] = React.useState<Set<string>>(new Set());
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
      { id: "celular", label: "Celular", group: "Contato", coluna: { key: "celular", header: "Celular", sortable: true, width: "190px", cell: (c) => <PhoneNumber value={c.phone} className="text-text-secondary" /> } },
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
  const [colunasEscolhidas, gravarColunas] = useListaSalva(chaveDasColunas("contatos", contrato, opcoes.meuId), validar);
  const porId = new Map(disponiveis.map((d) => [d.id, d.coluna]));
  const colunas = colunasEscolhidas.map((id) => porId.get(id)).filter((c): c is DataTableColumn<Contact> => !!c);

  // ── Busca no servidor ──
  const filtro = React.useMemo(
    () => montarFiltro(estado, BARRA_DE_CONTATOS, { daVisao: condicoesDaVisao(estado.visao, opcoes.meuId) }),
    [estado, opcoes.meuId]
  );
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
  const pronto = opcoes.carregado || estado.visao !== "meus";

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
  }, [corpoAtrasado, pronto, versao]);

  // Contagem de cada aba (só a condição da visão, sem a barra).
  React.useEffect(() => {
    if (!opcoes.carregado) return;
    let vivo = true;
    Promise.all(
      VISOES.map((v) =>
        fetch("/api/contacts/busca", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filtro: { rapidos: condicoesDaVisao(v.id, opcoes.meuId) }, apenasTotal: true }),
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
  }, [opcoes.carregado, opcoes.meuId, versao]);

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

  return (
    <div className="flex flex-col gap-3">
      <ViewTabs
        label="Visões de contatos"
        value={estado.visao}
        onChange={(v) => {
          setSelecionados(new Set());
          setEstado({ ...estado, visao: v, pagina: 1 });
        }}
        views={VISOES.map((v) => ({ id: v.id, label: v.label, count: contagens[v.id] }))}
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

      {selecionados.size > 0 && (
        <div className="flex h-9 items-center gap-3 rounded-md bg-accent-subtle px-3 text-small text-text-primary" role="status">
          <span className="font-medium tabular-nums">
            {selecionados.size} selecionado{selecionados.size > 1 ? "s" : ""}
          </span>
          <span className="text-text-secondary">Ações em massa chegam na próxima etapa.</span>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelecionados(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border-subtle bg-panel">
        <DataTable
          caption="Contatos"
          columns={colunas}
          rows={linhas}
          getRowKey={(c) => c.id}
          getRowLabel={nomeDoContato}
          sort={estado.ordem}
          onSortChange={(ordem) => setEstado({ ...estado, ordem, pagina: 1 })}
          selected={selecionados}
          onSelectedChange={setSelecionados}
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
        onChange={gravarColunas}
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
