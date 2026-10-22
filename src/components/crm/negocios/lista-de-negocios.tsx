"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Badge } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty-state";
import { ColumnPicker, type ColumnOption } from "@/components/ui/column-picker";
import { formatMoney } from "@/components/ui/kanban-column";
import { useComAtraso } from "@/components/crm/listas/use-estado-da-lista";
import type { Selecao } from "@/components/crm/listas/acoes-em-massa";
import { formatarValor, type DefinicaoDeCampo } from "@/lib/custom-fields";
import type { FiltroCrm } from "@/lib/filtro-crm";
import { colunasValidas } from "@/lib/listas/colunas";
import type { EstadoDaLista } from "@/lib/listas/estado-da-lista";
import { clampPage } from "@/lib/design-system/pagination";
import { SinalDoProximoPasso } from "./deal-card";
import { tempoNaEtapa, type NegocioKanban } from "./modelo";

// ---------------------------------------------------------------------------
// Negócios em lista: paginada e ordenada no servidor (POST /api/deals/busca),
// mesmas colunas editáveis da lista de contatos (da visão salva ou do
// navegador), seleção com ações em massa e soma do filtro.
// ---------------------------------------------------------------------------

export interface LinhaDeNegocio extends NegocioKanban {
  stage: { id: string; name: string; type: string; position: number; rottingDays?: number | null };
}

interface Resposta {
  total: number;
  deals: LinhaDeNegocio[];
  somaCents: number;
  avisos: string[];
  truncado: boolean;
}

/** Coluna da tabela → campo de ordenação do servidor (ORDENACOES.negocios). */
const ORDENA_POR: Record<string, string> = {
  nome: "nome",
  valor: "valor",
  etapa: "etapa",
  responsavel: "responsavel",
  previsao: "previsao",
  tempo: "diasNaEtapa",
  criadoEm: "criadoEm",
  fechadoEm: "fechadoEm",
};

export const COLUNAS_PADRAO_DE_NEGOCIO = ["nome", "valor", "etapa", "responsavel", "empresa", "contato", "proximoPasso", "previsao", "tempo", "criadoEm"];
const FIXAS = ["nome"];

const dataCurta = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }) : null);
const diaSemFuso = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10).split("-").reverse().join("/") : null);
const vazio = <span className="text-text-tertiary">—</span>;

export function ListaDeNegocios({
  filtro,
  pipelineId,
  estado,
  onEstado,
  defs,
  agora,
  versao,
  colunasSalvas,
  onColunas,
  editandoColunas,
  onEditandoColunas,
  onAbrir,
  selecao,
  onSelecao,
  acoesEmMassa,
}: {
  filtro: FiltroCrm;
  pipelineId: string;
  estado: EstadoDaLista;
  onEstado: (e: EstadoDaLista) => void;
  defs: DefinicaoDeCampo[];
  agora: Date;
  versao: number;
  /** Colunas escolhidas (da visão salva ou do navegador); undefined = padrão. */
  colunasSalvas?: string[];
  onColunas: (ids: string[]) => void;
  editandoColunas: boolean;
  onEditandoColunas: (v: boolean) => void;
  onAbrir: (d: LinhaDeNegocio) => void;
  selecao: Selecao;
  onSelecao: (s: Selecao) => void;
  /** Barra de ações em massa (recebe o total do filtro e se a página toda está marcada). */
  acoesEmMassa: (total: number, paginaToda: boolean) => React.ReactNode;
}) {
  const [dados, setDados] = React.useState<Resposta | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const disponiveis: (ColumnOption & { coluna: DataTableColumn<LinhaDeNegocio> })[] = React.useMemo(
    () => [
      {
        id: "nome",
        label: "Negócio",
        group: "Negócio",
        coluna: {
          key: "nome",
          header: "Negócio",
          sortable: true,
          width: "260px",
          cell: (d) => (
            <Link
              href={`/negocios/${d.id}`}
              onClick={(e) => e.stopPropagation()}
              className="block truncate font-medium text-text-primary hover:text-accent-fg hover:underline"
            >
              {d.name}
            </Link>
          ),
        },
      },
      { id: "valor", label: "Valor", group: "Negócio", coluna: { key: "valor", header: "Valor", numeric: true, sortable: true, width: "130px", cell: (d) => (d.amountCents ? formatMoney(d.amountCents / 100) : vazio) } },
      {
        id: "etapa",
        label: "Etapa",
        group: "Negócio",
        coluna: {
          key: "etapa",
          header: "Etapa",
          sortable: true,
          width: "160px",
          cell: (d) =>
            d.stage.type === "won" ? <Badge variant="success">{d.stage.name}</Badge> : d.stage.type === "lost" ? <Badge variant="danger">{d.stage.name}</Badge> : d.stage.name,
        },
      },
      { id: "probabilidade", label: "Chance", group: "Negócio", coluna: { key: "probabilidade", header: "Chance", numeric: true, width: "90px", cell: (d) => `${d.probability}%` } },
      {
        id: "responsavel",
        label: "Responsável",
        group: "Negócio",
        coluna: {
          key: "responsavel",
          header: "Responsável",
          sortable: true,
          width: "170px",
          cell: (d) =>
            d.owner ? (
              <span className="flex items-center gap-1.5">
                <Avatar name={d.owner.name || "Sem nome"} size="sm" />
                <span className="truncate">{d.owner.name || "Sem nome"}</span>
              </span>
            ) : (
              vazio
            ),
        },
      },
      { id: "empresa", label: "Empresa", group: "Negócio", coluna: { key: "empresa", header: "Empresa", width: "180px", cell: (d) => d.company?.name ?? vazio } },
      { id: "contato", label: "Contato", group: "Contato", coluna: { key: "contato", header: "Contato", width: "180px", cell: (d) => d.contacts[0]?.name || vazio } },
      {
        id: "proximoPasso",
        label: "Próximo passo",
        group: "Negócio",
        coluna: { key: "proximoPasso", header: "Próximo passo", width: "200px", cell: (d) => <SinalDoProximoPasso deal={d} tipoDaEtapa={d.stage.type} prazoParado={d.stage.rottingDays} agora={agora} /> },
      },
      { id: "previsao", label: "Previsão de fechamento", group: "Datas", coluna: { key: "previsao", header: "Previsão", sortable: true, width: "110px", cell: (d) => diaSemFuso(d.expectedClosingAt) ?? vazio } },
      {
        id: "tempo",
        label: "Tempo na etapa",
        group: "Datas",
        coluna: { key: "tempo", header: "Na etapa há", sortable: true, width: "120px", cell: (d) => (d.stage.type === "open" ? <span className="text-text-secondary">{tempoNaEtapa(d.stageSince, agora)}</span> : vazio) },
      },
      { id: "criadoEm", label: "Criado em", group: "Datas", coluna: { key: "criadoEm", header: "Criado em", sortable: true, width: "110px", cell: (d) => <span className="tabular-nums text-text-secondary">{dataCurta(d.createdAt)}</span> } },
      { id: "fechadoEm", label: "Fechado em", group: "Datas", coluna: { key: "fechadoEm", header: "Fechado em", sortable: true, width: "110px", cell: (d) => dataCurta(d.closedAt) ?? vazio } },
      { id: "tarefas", label: "Tarefas abertas", group: "Negócio", coluna: { key: "tarefas", header: "Tarefas", numeric: true, width: "90px", cell: (d) => d.openTasks || vazio } },
      ...defs.map((def) => ({
        id: `cf:${def.key}`,
        label: def.label,
        group: "Campos personalizados",
        coluna: {
          key: `cf:${def.key}`,
          header: def.label,
          width: "160px",
          numeric: def.type === "number" || def.type === "currency",
          cell: (d: LinhaDeNegocio) => formatarValor(def, d.customFields?.[def.key]) || vazio,
        } satisfies DataTableColumn<LinhaDeNegocio>,
      })),
    ],
    [defs, agora]
  );
  const ids = React.useMemo(() => disponiveis.map((d) => d.id), [disponiveis]);
  // Até os campos personalizados chegarem, "cf:" salvo não é descartado.
  const escolhidas = React.useMemo(
    () => colunasValidas(colunasSalvas ?? null, [...ids, ...(colunasSalvas ?? []).filter((c) => c.startsWith("cf:") && !defs.length)], COLUNAS_PADRAO_DE_NEGOCIO, FIXAS),
    [colunasSalvas, ids, defs.length]
  );
  const porId = new Map(disponiveis.map((d) => [d.id, d.coluna]));
  const colunas = escolhidas.map((id) => porId.get(id)).filter((c): c is DataTableColumn<LinhaDeNegocio> => !!c);

  const corpo = React.useMemo(
    () =>
      JSON.stringify({
        filtro,
        pipeline: pipelineId,
        ...(estado.ordem ? { sort: ORDENA_POR[estado.ordem.key] ?? estado.ordem.key, dir: estado.ordem.direction } : {}),
        page: estado.pagina,
        pageSize: estado.tamanho,
      }),
    [filtro, pipelineId, estado.ordem, estado.pagina, estado.tamanho]
  );
  const corpoAtrasado = useComAtraso(corpo, 250);

  const ultima = React.useRef(0);
  React.useEffect(() => {
    if (!pipelineId) return;
    const n = ++ultima.current;
    let vivo = true;
    fetch("/api/deals/busca", { method: "POST", headers: { "Content-Type": "application/json" }, body: corpoAtrasado })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error ?? "Não foi possível carregar os negócios.");
        return d as Resposta;
      })
      .then((d) => {
        if (!vivo || n !== ultima.current) return;
        setDados(d);
        setErro(null);
      })
      .catch((e: Error) => vivo && n === ultima.current && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [corpoAtrasado, pipelineId, versao]);

  const total = dados?.total ?? 0;

  return (
    <div className="flex flex-col gap-3">
      {erro && (
        <Notice tone="danger" onDismiss={() => setErro(null)}>
          {erro}
        </Notice>
      )}
      {dados && dados.avisos.length > 0 && <Notice tone="warning">{dados.avisos.join(" ")}</Notice>}
      {dados?.truncado && <Notice tone="warning">Um filtro por campo personalizado de número ou data olhou só os primeiros 5.000 negócios; a lista pode estar incompleta.</Notice>}
      {acoesEmMassa(total, (dados?.deals.length ?? 0) > 0 && dados!.deals.every((d) => selecao.ids.has(d.id)))}
      <div className="overflow-hidden rounded-lg border border-border-subtle bg-panel">
        <DataTable
          caption="Negócios"
          columns={colunas}
          rows={dados?.deals ?? []}
          getRowKey={(d) => d.id}
          getRowLabel={(d) => d.name}
          sort={estado.ordem}
          onSortChange={(ordem) => onEstado({ ...estado, ordem, pagina: 1 })}
          selected={selecao.ids}
          onSelectedChange={(ids) => onSelecao({ ids, todos: false })}
          loading={!dados}
          loadingRows={10}
          onRowClick={onAbrir}
          className="max-h-[calc(100dvh-320px)] min-h-80"
          empty={<EmptyState compact title="Nenhum negócio encontrado" description="Nenhum negócio deste funil bate com a visão e os filtros." />}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-subtle px-3 py-2">
          <span className="text-small text-text-secondary">
            Soma do filtro: <span className="font-medium tabular-nums text-text-primary">{formatMoney((dados?.somaCents ?? 0) / 100)}</span>
          </span>
          <Pagination
            className="flex-1"
            page={estado.pagina}
            pageSize={estado.tamanho}
            total={total}
            onPageChange={(p) => onEstado({ ...estado, pagina: p })}
            onPageSizeChange={(t) => onEstado({ ...estado, tamanho: t, pagina: clampPage(estado.pagina, total, t) })}
          />
        </div>
      </div>
      <ColumnPicker
        open={editandoColunas}
        onOpenChange={onEditandoColunas}
        options={disponiveis}
        value={escolhidas}
        defaultValue={COLUNAS_PADRAO_DE_NEGOCIO}
        fixed={FIXAS}
        onChange={onColunas}
      />
    </div>
  );
}
