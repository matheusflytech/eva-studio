"use client";

import * as React from "react";
import { CircleHelp, ListFilter, Plus, X } from "lucide-react";
import Link from "@/components/contrato/link";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { FilterButton, type FilterOption } from "@/components/ui/filter-button";
import { focusRing } from "@/components/ui/styles";
import { cn } from "@/lib/utils";
import { NovaEmpresa } from "./nova-empresa";
import { FotoDaPessoa, LogoDaEmpresa, cidadeUf } from "./pecas";

// ---------------------------------------------------------------------------
// Lista de empresas, irmã da de Contatos: título com o número de apoio em
// mono, uma ação principal, e embaixo busca + "Filtros". Cada linha tem só
// quatro coisas (logo, nome, quantos negócios e o dono); CNPJ, setor, cidade
// e contatos ficam na página da empresa, e a busca continua achando por CNPJ
// e setor (no servidor, como antes).
//
// Os filtros (proprietário, setor, cidade) olham as empresas que a busca
// trouxe: a rota devolve até 200 e não filtra por esses campos, então o
// recorte é feito aqui, sem mudar a API.
// ---------------------------------------------------------------------------

interface Company {
  id: string;
  name: string;
  cnpj: string;
  sector: string;
  website: string;
  phone: string;
  city: string;
  uf: string;
  owner: { id: string; name: string } | null;
  contactCount: number;
  dealCount: number;
}

/** Teto da rota (take: 200): com isso na mão, o número vira "200+". */
const LIMITE_DA_ROTA = 200;
const SEM_DONO = "__sem_dono";
const numero = new Intl.NumberFormat("pt-BR");

interface Filtros {
  donos: string[];
  setores: string[];
  cidades: string[];
}
const SEM_FILTROS: Filtros = { donos: [], setores: [], cidades: [] };

/** Opções de um filtro a partir do que veio, com a quantidade ao lado. */
function opcoesDe(companies: Company[], chave: (c: Company) => { value: string; label: string } | null): FilterOption[] {
  const mapa = new Map<string, { label: string; n: number }>();
  for (const c of companies) {
    const o = chave(c);
    if (!o) continue;
    const atual = mapa.get(o.value);
    if (atual) atual.n++;
    else mapa.set(o.value, { label: o.label, n: 1 });
  }
  return [...mapa.entries()]
    .sort((a, b) => a[1].label.localeCompare(b[1].label, "pt-BR"))
    .map(([value, { label, n }]) => ({ value, label, hint: String(n) }));
}

export function ListaDeEmpresas() {
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [query, setQuery] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [carregou, setCarregou] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [showNew, setShowNew] = React.useState(false);
  const [filtros, setFiltros] = React.useState<Filtros>(SEM_FILTROS);
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/companies${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar as empresas.");
      setCompanies(data.companies ?? []);
      setErro(null);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível carregar as empresas.");
    } finally {
      setIsLoading(false);
      setCarregou(true);
    }
  }, [query]);

  React.useEffect(() => {
    const timer = setTimeout(() => refresh(), 300);
    return () => clearTimeout(timer);
  }, [refresh]);

  const opcoes = React.useMemo(
    () => ({
      donos: opcoesDe(companies, (c) => (c.owner ? { value: c.owner.id, label: c.owner.name || "Sem nome" } : { value: SEM_DONO, label: "Sem proprietário" })),
      setores: opcoesDe(companies, (c) => (c.sector.trim() ? { value: c.sector.trim(), label: c.sector.trim() } : null)),
      cidades: opcoesDe(companies, (c) => {
        const cidade = cidadeUf(c.city.trim(), c.uf.trim());
        return cidade ? { value: cidade, label: cidade } : null;
      }),
    }),
    [companies]
  );

  const visiveis = React.useMemo(
    () =>
      companies.filter(
        (c) =>
          (filtros.donos.length === 0 || filtros.donos.includes(c.owner?.id ?? SEM_DONO)) &&
          (filtros.setores.length === 0 || filtros.setores.includes(c.sector.trim())) &&
          (filtros.cidades.length === 0 || filtros.cidades.includes(cidadeUf(c.city.trim(), c.uf.trim())))
      ),
    [companies, filtros]
  );

  const nFiltros = [filtros.donos, filtros.setores, filtros.cidades].filter((v) => v.length > 0).length;
  const filtrando = !!query.trim() || nFiltros > 0;
  const noTeto = companies.length >= LIMITE_DA_ROTA;
  const rotulo = carregou
    ? `${numero.format(visiveis.length)}${noTeto ? "+" : ""} ${filtrando ? (visiveis.length === 1 ? "encontrada" : "encontradas") : "no total"}`
    : "";

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
      <header className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <div className="min-w-0">
          <p className="h-4 font-mono text-caption uppercase tracking-wider text-text-tertiary tabular-nums">{rotulo}</p>
          <h1 className="text-heading font-semibold tracking-tight text-text-primary">Empresas</h1>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {/* A explicação da tela mora no ícone de ajuda, não num parágrafo fixo. */}
          <IconButton
            aria-label="Sobre empresas"
            tooltip="A conta por trás das pessoas: cinco contatos do mesmo lugar são uma conta só, e é nela que o negócio acontece."
          >
            <CircleHelp aria-hidden="true" />
          </IconButton>
          <Button variant="primary" onClick={() => setShowNew(true)}>
            <Plus size={14} aria-hidden="true" />
            Nova empresa
          </Button>
        </div>
      </header>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            aria-label="Buscar empresas"
            placeholder="Buscar por nome, CNPJ ou setor"
            value={query}
            onValueChange={setQuery}
            className="w-full sm:w-[340px]"
          />
          <Button
            variant="secondary"
            aria-expanded={filtrosAbertos}
            aria-controls="filtros-de-empresas"
            onClick={() => setFiltrosAbertos((v) => !v)}
          >
            <ListFilter size={14} aria-hidden="true" />
            Filtros
            {nFiltros > 0 && (
              <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-accent-solid px-1 text-caption tabular-nums text-text-on-accent">
                {nFiltros}
              </span>
            )}
          </Button>
        </div>

        {filtrosAbertos && (
          <div
            id="filtros-de-empresas"
            role="group"
            aria-label="Filtros de empresas"
            className="flex flex-wrap items-center gap-1 rounded-[18px] border border-border-subtle bg-panel px-3 py-1.5"
          >
            <FilterButton label="Proprietário" options={opcoes.donos} selected={filtros.donos} onChange={(v) => setFiltros({ ...filtros, donos: v })} />
            <FilterButton label="Setor" options={opcoes.setores} selected={filtros.setores} onChange={(v) => setFiltros({ ...filtros, setores: v })} />
            <FilterButton label="Cidade" options={opcoes.cidades} selected={filtros.cidades} onChange={(v) => setFiltros({ ...filtros, cidades: v })} />
            {nFiltros > 0 && (
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => setFiltros(SEM_FILTROS)}>
                <X size={13} aria-hidden="true" /> Limpar
              </Button>
            )}
          </div>
        )}
      </div>

      {erro && (
        <Notice tone="danger" onDismiss={() => setErro(null)}>
          {erro}
        </Notice>
      )}

      {isLoading && !carregou ? (
        <div role="status" aria-label="Carregando empresas" className="flex flex-col">
          {Array.from({ length: 7 }, (_, i) => (
            <span key={i} className="flex h-16 items-center gap-4 border-b border-border-subtle px-2 last:border-b-0">
              <span className="size-9 animate-pulse rounded-[10px] bg-raised motion-reduce:animate-none" />
              <span className="h-3 w-48 animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none" />
            </span>
          ))}
        </div>
      ) : visiveis.length === 0 ? (
        <EmptyState
          compact
          title={filtrando ? "Nenhuma empresa encontrada" : "Nenhuma empresa ainda"}
          description={
            filtrando
              ? "Tente outro termo ou tire algum filtro."
              : "Cadastre a primeira, ou vincule uma empresa a um contato na tela de Contatos."
          }
          action={
            filtrando ? undefined : (
              <Button variant="primary" onClick={() => setShowNew(true)}>
                Nova empresa
              </Button>
            )
          }
        />
      ) : (
        <ul aria-label="Empresas" aria-busy={isLoading || undefined} className="flex flex-col">
          {visiveis.map((c) => (
            <LinhaDaEmpresa key={c.id} empresa={c} />
          ))}
        </ul>
      )}

      {showNew && (
        <NovaEmpresa
          onClose={() => setShowNew(false)}
          onCreated={() => {
            setShowNew(false);
            refresh();
          }}
        />
      )}
    </div>
  );
}

/** Logo, nome, negócios e dono. No celular o dono sai (mora na página). */
function LinhaDaEmpresa({ empresa: c }: { empresa: Company }) {
  return (
    <li className="border-b border-border-subtle last:border-b-0">
      <Link
        href={`/companies/${c.id}`}
        className={cn(
          "grid h-16 w-full grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-4 rounded-xl px-2 transition-colors duration-120 hover:bg-raised",
          "sm:grid-cols-[36px_minmax(0,1fr)_150px_170px]",
          focusRing
        )}
      >
        <LogoDaEmpresa nome={c.name} semente={c.id} />
        <span className="truncate text-body font-medium text-text-primary">{c.name || "Empresa sem nome"}</span>
        <span className={cn("text-small tabular-nums", c.dealCount > 0 ? "text-text-secondary" : "text-text-tertiary")}>
          {c.dealCount === 0 ? "Nenhum negócio" : `${numero.format(c.dealCount)} ${c.dealCount === 1 ? "negócio" : "negócios"}`}
        </span>
        {c.owner ? (
          <span className="hidden min-w-0 items-center gap-2 text-small text-text-secondary sm:flex">
            <FotoDaPessoa nome={c.owner.name || "Sem nome"} semente={c.owner.id} />
            <span className="truncate">{c.owner.name || "Sem nome"}</span>
          </span>
        ) : (
          <span className="hidden text-small text-text-tertiary sm:block">Sem proprietário</span>
        )}
      </Link>
    </li>
  );
}
