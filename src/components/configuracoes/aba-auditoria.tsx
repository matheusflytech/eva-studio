"use client";

import * as React from "react";
import { ChevronDown, History, ListFilter, Loader2 } from "lucide-react";
import Link from "@/components/contrato/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchInput } from "@/components/ui/search-input";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { IconeDoAtor, ListaDeMudancas } from "@/components/historico/pecas";
import { detalhesLegiveis } from "@/lib/historico/formatar";
import { ROTULO_DO_OBJETO, type ItemDoHistorico, type TipoDoAtor } from "@/lib/historico/tipos";
import { cn, formatRelativeDate } from "@/lib/utils";
import { CabecalhoDaSecao } from "./secao";

interface Resposta {
  disponivel: boolean;
  itens: ItemDoHistorico[];
  proximo: string | null;
  pessoas?: { id: string; nome: string }[];
}

const TIPOS = [
  { id: "deal", rotulo: "Negócios" },
  { id: "contact", rotulo: "Contatos" },
  { id: "company", rotulo: "Empresas" },
  { id: "acesso", rotulo: "Equipe e acesso" },
  { id: "api_key", rotulo: "Chaves de API" },
  { id: "export", rotulo: "Exportações" },
] as const;

const ACOES = [
  { id: "criou", rotulo: "Criou" },
  { id: "alterou", rotulo: "Alterou" },
  { id: "apagou", rotulo: "Apagou ou revogou" },
  { id: "restaurou", rotulo: "Restaurou" },
  { id: "exportou", rotulo: "Exportou" },
] as const;

const ROBOS: { id: Exclude<TipoDoAtor, "usuario">; rotulo: string }[] = [
  { id: "agente", rotulo: "Agente de IA" },
  { id: "automacao", rotulo: "Automação" },
  { id: "api", rotulo: "API" },
  { id: "sistema", rotulo: "Sistema" },
];

const PERIODOS = [
  { id: "", rotulo: "Desde o início", dias: 0 },
  { id: "7", rotulo: "Últimos 7 dias", dias: 7 },
  { id: "30", rotulo: "Últimos 30 dias", dias: 30 },
  { id: "90", rotulo: "Últimos 90 dias", dias: 90 },
] as const;

interface Filtros {
  busca: string;
  tipo: string;
  acao: string;
  /** "p:<userId>" para uma pessoa, "r:<tipo>" para agente/automação/API/sistema. */
  quem: string;
  periodo: string;
}

const SEM_FILTRO: Filtros = { busca: "", tipo: "", acao: "", quem: "", periodo: "" };

/** AAAA-MM-DD de hoje menos N dias, no calendário de São Paulo. */
function diaHa(dias: number): string {
  return new Date(Date.now() - dias * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
}

function consulta(f: Filtros, cursor?: string | null): string {
  const p = new URLSearchParams();
  if (f.busca.trim()) p.set("q", f.busca.trim());
  if (f.tipo) p.set("tipo", f.tipo);
  if (f.acao) p.set("acao", f.acao);
  if (f.quem.startsWith("p:")) p.set("ator", f.quem.slice(2));
  if (f.quem.startsWith("r:")) p.set("atorTipo", f.quem.slice(2));
  const periodo = PERIODOS.find((x) => x.id === f.periodo);
  if (periodo?.dias) p.set("de", diaHa(periodo.dias));
  if (cursor) p.set("cursor", cursor);
  return p.toString();
}

const LINK_DO_REGISTRO: Partial<Record<string, (id: string) => string>> = {
  deal: (id) => `/negocios/${id}`,
  contact: (id) => `/contatos/${id}`,
  company: (id) => `/empresas/${id}`,
};

// Configurações → Auditoria: tudo o que foi feito no contrato, de quem, mais
// recente primeiro. Registros (criar, alterar, apagar, restaurar) e ações da
// conta (equipe, papéis, chaves de API, exportações). Guardado por 2 anos.
export function AbaAuditoria() {
  const [filtros, setFiltros] = React.useState<Filtros>(SEM_FILTRO);
  const [dados, setDados] = React.useState<Resposta | null>(null);
  const [pessoas, setPessoas] = React.useState<{ id: string; nome: string }[]>([]);
  const [erro, setErro] = React.useState<string | null>(null);
  const [carregandoMais, setCarregandoMais] = React.useState(false);
  const [aberto, setAberto] = React.useState<string | null>(null);

  const carregar = React.useCallback(async (f: Filtros) => {
    try {
      const res = await fetch(`/api/auditoria?${consulta(f)}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErro(d.error ?? "Não foi possível abrir a auditoria.");
        return;
      }
      setErro(null);
      setDados(d);
      if (d.pessoas) setPessoas(d.pessoas);
    } catch {
      setErro("Sem conexão. Tente de novo.");
    }
  }, []);

  // Busca espera a pessoa parar de digitar.
  React.useEffect(() => {
    const t = window.setTimeout(() => void carregar(filtros), filtros.busca ? 250 : 0);
    return () => window.clearTimeout(t);
  }, [filtros, carregar]);

  async function carregarMais() {
    if (!dados?.proximo) return;
    setCarregandoMais(true);
    try {
      const res = await fetch(`/api/auditoria?${consulta(filtros, dados.proximo)}`);
      const d: Resposta = await res.json();
      if (!res.ok) throw new Error();
      setDados((atual) => (atual ? { ...atual, itens: [...atual.itens, ...d.itens], proximo: d.proximo } : d));
    } catch {
      setErro("Não foi possível carregar mais. Tente de novo.");
    } finally {
      setCarregandoMais(false);
    }
  }

  const mudar = (parcial: Partial<Filtros>) => setFiltros((f) => ({ ...f, ...parcial }));
  const ligados = [filtros.tipo, filtros.acao, filtros.quem, filtros.periodo].filter(Boolean).length;
  const comFiltro = ligados > 0 || !!filtros.busca.trim();

  return (
    <div className="flex flex-col gap-3">
      <CabecalhoDaSecao
        className="pb-2"
        titulo="Auditoria"
        descricao="Tudo o que foi feito no contrato: quem criou, alterou, apagou ou exportou, e quem mexeu em equipe, papéis e chaves de API. Fica guardado por 2 anos."
        acoes={
          <>
            <SearchInput
              aria-label="Buscar na auditoria"
              placeholder="Buscar pelo nome do registro"
              value={filtros.busca}
              onValueChange={(busca) => mudar({ busca })}
              className="w-full sm:w-60"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="secondary" aria-label={ligados ? `Filtros, ${ligados} ligado${ligados > 1 ? "s" : ""}` : "Filtros"}>
                  <ListFilter size={14} aria-hidden="true" />
                  Filtros
                  {ligados > 0 && <span className="font-mono text-caption tabular-nums text-accent-fg">{ligados}</span>}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-[min(520px,var(--radix-dropdown-menu-content-available-height))] w-60 overflow-y-auto">
                <DropdownMenuLabel>Período</DropdownMenuLabel>
                {PERIODOS.map((p) => (
                  <DropdownMenuCheckboxItem key={p.id} checked={filtros.periodo === p.id} onCheckedChange={() => mudar({ periodo: p.id })}>
                    {p.rotulo}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Quem fez</DropdownMenuLabel>
                <DropdownMenuCheckboxItem checked={!filtros.quem} onCheckedChange={() => mudar({ quem: "" })}>
                  Todos
                </DropdownMenuCheckboxItem>
                {pessoas.map((p) => (
                  <DropdownMenuCheckboxItem key={p.id} checked={filtros.quem === `p:${p.id}`} onCheckedChange={() => mudar({ quem: `p:${p.id}` })}>
                    {p.nome}
                  </DropdownMenuCheckboxItem>
                ))}
                {ROBOS.map((r) => (
                  <DropdownMenuCheckboxItem key={r.id} checked={filtros.quem === `r:${r.id}`} onCheckedChange={() => mudar({ quem: `r:${r.id}` })}>
                    {r.rotulo}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Tipo</DropdownMenuLabel>
                <DropdownMenuCheckboxItem checked={!filtros.tipo} onCheckedChange={() => mudar({ tipo: "" })}>
                  Todos os tipos
                </DropdownMenuCheckboxItem>
                {TIPOS.map((t) => (
                  <DropdownMenuCheckboxItem key={t.id} checked={filtros.tipo === t.id} onCheckedChange={() => mudar({ tipo: t.id })}>
                    {t.rotulo}
                  </DropdownMenuCheckboxItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Ação</DropdownMenuLabel>
                <DropdownMenuCheckboxItem checked={!filtros.acao} onCheckedChange={() => mudar({ acao: "" })}>
                  Todas as ações
                </DropdownMenuCheckboxItem>
                {ACOES.map((a) => (
                  <DropdownMenuCheckboxItem key={a.id} checked={filtros.acao === a.id} onCheckedChange={() => mudar({ acao: a.id })}>
                    {a.rotulo}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {ligados > 0 && (
              <Button variant="ghost" onClick={() => setFiltros((f) => ({ ...SEM_FILTRO, busca: f.busca }))}>
                Limpar filtros
              </Button>
            )}
          </>
        }
      />

      {dados && !dados.disponivel && (
        <Notice tone="warning">O histórico ainda não está ativado neste contrato. Assim que estiver, cada ação passa a aparecer aqui.</Notice>
      )}
      {erro && <Notice tone="danger">{erro}</Notice>}

      {!dados && !erro ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando a auditoria">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-[14px]" />
          ))}
        </div>
      ) : dados && dados.itens.length === 0 ? (
        dados.disponivel && (
          <EmptyState
            compact
            icon={<History size={18} aria-hidden="true" className="text-text-tertiary" />}
            title={comFiltro ? "Nada encontrado" : "Nada registrado ainda"}
            description={comFiltro ? "Tente outro nome, período ou filtro." : "O que for criado, alterado, apagado ou exportado aparece aqui."}
          />
        )
      ) : (
        dados && (
          <>
            <ol aria-label="Ações registradas" className="flex flex-col divide-y divide-border-subtle rounded-[18px] border border-border-subtle bg-panel">
              {dados.itens.map((h) => (
                <LinhaDaAuditoria key={h.id} item={h} aberta={aberto === h.id} onAlternar={() => setAberto((a) => (a === h.id ? null : h.id))} />
              ))}
            </ol>
            {dados.proximo && (
              <Button variant="secondary" className="self-center" onClick={() => void carregarMais()} disabled={carregandoMais}>
                {carregandoMais && <Loader2 size={14} className="animate-spin" aria-hidden />}
                Carregar mais
              </Button>
            )}
          </>
        )
      )}
    </div>
  );
}

function LinhaDaAuditoria({ item, aberta, onAlternar }: { item: ItemDoHistorico; aberta: boolean; onAlternar: () => void }) {
  const detalhes = detalhesLegiveis(item.detalhes);
  const temDetalhe = item.mudancas.length > 0 || detalhes.length > 0 || !!LINK_DO_REGISTRO[item.objeto];
  const link = item.existe ? LINK_DO_REGISTRO[item.objeto]?.(item.objetoId) : undefined;
  const ehRegistro = !!LINK_DO_REGISTRO[item.objeto];
  const idDoDetalhe = `auditoria-${item.id}`;
  const quando = new Date(item.em);

  return (
    <li>
      <button
        type="button"
        onClick={onAlternar}
        disabled={!temDetalhe}
        aria-expanded={temDetalhe ? aberta : undefined}
        aria-controls={temDetalhe ? idDoDetalhe : undefined}
        className={cn(
          "flex w-full items-center gap-3 px-3.5 py-3 text-left outline-none transition-colors first:rounded-t-[18px] focus-visible:bg-hover",
          temDetalhe && "hover:bg-raised",
          aberta && "bg-raised"
        )}
      >
        <IconeDoAtor tipo={item.atorTipo} nome={item.atorNome} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-small text-text-primary">
            <span className="font-semibold">{item.atorNome}</span>
            <span className="text-text-secondary"> · {item.resumo}</span>
          </span>
          <span className="mt-0.5 flex min-w-0 items-center gap-2 text-caption text-text-tertiary">
            <Badge className="shrink-0">{ROTULO_DO_OBJETO[item.objeto] ?? item.objeto}</Badge>
            {ehRegistro && <span className="truncate">{item.objetoNome || "Sem nome"}</span>}
          </span>
        </span>
        <time dateTime={item.em} title={quando.toLocaleString("pt-BR")} className="shrink-0 font-mono text-caption tabular-nums text-text-tertiary">
          {formatRelativeDate(item.em)}
        </time>
        {temDetalhe && (
          <ChevronDown size={15} aria-hidden className={cn("shrink-0 text-text-tertiary transition-transform duration-200", aberta && "rotate-180")} />
        )}
      </button>
      {aberta && temDetalhe && (
        <div id={idDoDetalhe} className="flex flex-col gap-3 px-3.5 pb-4 pl-[3.75rem]">
          <ListaDeMudancas mudancas={item.mudancas} />
          {detalhes.length > 0 && (
            <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 text-caption">
              {detalhes.map((d) => (
                <React.Fragment key={d.rotulo}>
                  <dt className="text-text-tertiary">{d.rotulo}</dt>
                  <dd className="min-w-0 break-words text-text-secondary">{d.valor}</dd>
                </React.Fragment>
              ))}
            </dl>
          )}
          <p className="text-caption text-text-tertiary">
            {quando.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short" })}
            {ehRegistro &&
              (link ? (
                <>
                  {" · "}
                  <Link href={link} className="text-accent-fg underline-offset-2 hover:underline">
                    Abrir {ROTULO_DO_OBJETO[item.objeto].toLowerCase()}
                  </Link>
                </>
              ) : (
                " · registro apagado"
              ))}
          </p>
        </div>
      )}
    </li>
  );
}
