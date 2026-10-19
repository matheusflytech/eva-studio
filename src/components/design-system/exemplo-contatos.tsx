"use client";

import * as React from "react";
import { Download, MoreHorizontal, Plus, Search, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { PageHeader } from "@/components/ui/page-header";
import { ViewTabs } from "@/components/ui/view-tabs";
import { Toolbar, ToolbarSeparator } from "@/components/ui/toolbar";
import { FilterButton } from "@/components/ui/filter-button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Pagination } from "@/components/ui/pagination";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { sortRows, clampPage, type SortState } from "@/lib/design-system/pagination";
import { formatMoney } from "@/components/ui/kanban-column";
import {
  DONOS,
  ETAPAS_CONTATO,
  TOTAL_CONTATOS,
  paginaDeContatos,
  type ContatoFicticio,
  type EtapaContato,
} from "./dados-ficticios";

/* Exemplo de tela: lista de contatos montada só com o design system. */

const TOM_DA_ETAPA: Record<EtapaContato, BadgeProps["variant"]> = {
  Lead: "neutral",
  Qualificado: "info",
  Oportunidade: "warning",
  Cliente: "success",
  Inativo: "neutral",
};

const COLUNAS: DataTableColumn<ContatoFicticio>[] = [
  {
    key: "nome",
    header: "Nome",
    sortable: true,
    width: "220px",
    cell: (c) => (
      <span className="flex items-center gap-2">
        <Avatar name={c.nome} size="sm" />
        <a href="#exemplo-contatos" className="truncate font-medium text-text-primary hover:text-accent-fg hover:underline">
          {c.nome}
        </a>
      </span>
    ),
  },
  { key: "email", header: "E-mail", sortable: true, width: "240px", cell: (c) => <span className="text-text-secondary">{c.email}</span> },
  { key: "telefone", header: "Telefone", width: "150px", cell: (c) => <span className="tabular-nums text-text-secondary">{c.telefone}</span> },
  { key: "empresa", header: "Empresa", sortable: true, width: "180px", cell: (c) => c.empresa },
  { key: "dono", header: "Proprietário", sortable: true, width: "150px", cell: (c) => c.dono },
  { key: "etapa", header: "Etapa", sortable: true, width: "130px", cell: (c) => <Badge variant={TOM_DA_ETAPA[c.etapa]}>{c.etapa}</Badge> },
  { key: "origem", header: "Origem", width: "110px", cell: (c) => <span className="text-text-secondary">{c.origem}</span> },
  { key: "negocios", header: "Negócios", numeric: true, sortable: true, width: "100px", cell: (c) => c.negocios },
  { key: "valor", header: "Valor em aberto", numeric: true, sortable: true, width: "140px", cell: (c) => (c.valor ? formatMoney(c.valor) : <span className="text-text-tertiary">—</span>) },
  { key: "ultimaAtividade", header: "Última atividade", width: "140px", cell: (c) => <span className="text-text-secondary">{c.ultimaAtividade}</span> },
  {
    key: "acoes",
    header: "Ações",
    hideHeader: true,
    width: "48px",
    cell: (c) => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <IconButton aria-label={`Ações de ${c.nome}`} size="sm">
            <MoreHorizontal />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Abrir</DropdownMenuItem>
          <DropdownMenuItem>Criar negócio</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem tone="danger">Excluir</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
  },
];

export function ExemploContatos() {
  const [visao, setVisao] = React.useState("todos");
  const [donos, setDonos] = React.useState<string[]>([]);
  const [etapas, setEtapas] = React.useState<string[]>(["Cliente"]);
  const [origem, setOrigem] = React.useState<string[]>([]);
  const [pagina, setPagina] = React.useState(1);
  const [tamanho, setTamanho] = React.useState(25);
  const [ordem, setOrdem] = React.useState<SortState | null>(null);
  const [selecionados, setSelecionados] = React.useState<Set<string>>(new Set());

  // Ordena só a página (demonstração). Na tela real, ordem e filtros vão
  // para o servidor junto com a página.
  const linhas = sortRows(paginaDeContatos(pagina, tamanho), ordem, (c, k) => c[k as keyof ContatoFicticio]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Contatos"
        actions={
          <>
            <Button variant="secondary" size="md">
              <Download size={14} aria-hidden="true" />
              Exportar
            </Button>
            <Button variant="primary" size="md">
              <Plus size={14} aria-hidden="true" />
              Criar contato
            </Button>
          </>
        }
      />

      <ViewTabs
        label="Visões de contatos"
        value={visao}
        onChange={setVisao}
        onAdd={() => undefined}
        views={[
          { id: "todos", label: "Todos os contatos", count: TOTAL_CONTATOS },
          { id: "meus", label: "Meus contatos", count: 312 },
          { id: "sem-dono", label: "Sem proprietário", count: 1_204 },
          { id: "clientes", label: "Clientes ativos", count: 3_871 },
        ]}
      />

      <Toolbar
        label="Filtros de contatos"
        end={
          <>
            <div className="relative w-56">
              <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
              <Input aria-label="Buscar contatos" placeholder="Buscar nome, e-mail, telefone" className="pl-8" />
            </div>
            <Button variant="ghost" size="md">
              <SlidersHorizontal size={14} aria-hidden="true" />
              Colunas
            </Button>
          </>
        }
      >
        <FilterButton label="Proprietário" options={DONOS.map((d) => ({ value: d, label: d }))} selected={donos} onChange={setDonos} searchable />
        <FilterButton label="Etapa" options={ETAPAS_CONTATO.map((e) => ({ value: e, label: e }))} selected={etapas} onChange={setEtapas} />
        <FilterButton
          label="Origem"
          options={["WhatsApp", "Site", "Indicação", "Instagram", "Evento"].map((o) => ({ value: o, label: o }))}
          selected={origem}
          onChange={setOrigem}
        />
        <FilterButton label="Data de criação" options={[{ value: "7", label: "Últimos 7 dias" }, { value: "30", label: "Últimos 30 dias" }, { value: "90", label: "Últimos 90 dias" }]} selected={[]} onChange={() => undefined} />
        <ToolbarSeparator />
        <Button variant="ghost" size="sm" className="text-accent-fg hover:text-accent-fg">
          Filtros avançados
        </Button>
      </Toolbar>

      {selecionados.size > 0 && (
        <div className="flex h-9 items-center gap-3 rounded-md bg-accent-subtle px-3 text-small text-text-primary" role="status">
          <span className="font-medium tabular-nums">{selecionados.size} selecionado{selecionados.size > 1 ? "s" : ""}</span>
          <Button variant="ghost" size="sm">Atribuir proprietário</Button>
          <Button variant="ghost" size="sm">Editar</Button>
          <Button variant="ghost" size="sm" className="text-danger hover:text-danger">Excluir</Button>
          <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setSelecionados(new Set())}>
            Limpar seleção
          </Button>
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-border-subtle bg-panel">
        <DataTable
          caption="Contatos (dados fictícios)"
          columns={COLUNAS}
          rows={linhas}
          getRowKey={(c) => c.id}
          getRowLabel={(c) => c.nome}
          sort={ordem}
          onSortChange={setOrdem}
          selected={selecionados}
          onSelectedChange={setSelecionados}
          className="max-h-[640px]"
        />
        <Pagination
          className="border-t border-border-subtle px-3 py-2"
          page={pagina}
          pageSize={tamanho}
          total={TOTAL_CONTATOS}
          onPageChange={setPagina}
          onPageSizeChange={(t) => {
            setTamanho(t);
            setPagina((p) => clampPage(p, TOTAL_CONTATOS, t));
          }}
        />
      </div>
    </div>
  );
}
