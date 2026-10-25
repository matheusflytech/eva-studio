"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { useRouter } from "@/lib/contrato/navegacao";
import { BookOpen, CircleHelp, ListFilter, Plus, Workflow } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { SearchInput } from "@/components/ui/search-input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { NOMES_DOS_OBJETOS } from "@/lib/automacoes/catalogo";
import { fraseDaAutomacao } from "@/lib/automacoes/frase";
import { OBJETOS, type Definicao, type Objeto } from "@/lib/automacoes/tipos";
import { Galeria } from "@/components/automacoes/galeria";
import { duracao, ICONE_DO_OBJETO, nomesDasOpcoes, STATUS_DA_AUTOMACAO, useOpcoes } from "@/components/automacoes/comum";

// ---------------------------------------------------------------------------
// Automações. v5: uma pergunta só, "está tudo rodando?". Três números do dia
// e, em cada linha, o nome, o que ela faz em meia frase e um status (erro e
// pausa aparecem no próprio status). Execuções e erros de 30 dias ficam ao
// abrir a automação; os status viraram filtro; "Modelos" e "Nova automação"
// abrem a galeria.
// ---------------------------------------------------------------------------

interface ItemDaLista {
  id: string;
  nome: string;
  objeto: Objeto;
  status: string;
  origem: string;
  pausadaPor: string | null;
  rascunho: Definicao;
  versao: number | null;
  execucoes30d: number;
  erros30d: number;
  emAndamento: number;
  ultimaExecucao: string | null;
}

interface Dados {
  disponivel: boolean;
  aviso?: string;
  kpis: { execucoesHoje: number; errosHoje: number; tempoMedioMs: number | null; ativas: number } | null;
  automacoes: ItemDaLista[];
}

const FILTROS_DE_STATUS = [
  { valor: "ativa", rotulo: "Ligadas" },
  { valor: "pausada", rotulo: "Pausadas" },
  { valor: "rascunho", rotulo: "Rascunhos" },
] as const;

function Numero({ rotulo, valor, apoio, tom }: { rotulo: string; valor: string; apoio?: string; tom?: "erro" }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[18px] border border-border-subtle bg-panel px-4 py-3.5">
      <p className="truncate text-small text-text-secondary">{rotulo}</p>
      <p className={cn("text-display font-medium leading-none tracking-tight tabular-nums", tom === "erro" ? "text-danger" : "text-text-primary")}>
        {valor}
        {apoio && <span className="ml-1.5 text-small font-normal tracking-normal text-text-tertiary">{apoio}</span>}
      </p>
    </div>
  );
}

export default function AutomacoesPage() {
  const router = useRouter();
  const opcoes = useOpcoes();
  const nomes = React.useMemo(() => nomesDasOpcoes(opcoes), [opcoes]);
  const [dados, setDados] = React.useState<Dados | null>(null);
  const [galeria, setGaleria] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [status, setStatus] = React.useState<string[]>([]);
  const [objetos, setObjetos] = React.useState<Objeto[]>([]);

  React.useEffect(() => {
    let vivo = true;
    void fetch("/api/automacoes")
      .then((r) => r.json())
      .catch(() => ({ disponivel: false, kpis: null, automacoes: [] }))
      .then((d) => {
        if (vivo) setDados(d);
      });
    return () => {
      vivo = false;
    };
  }, []);

  async function criar(p: { modeloId?: string; objeto?: Objeto }) {
    const r = await fetch("/api/automacoes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(p) });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error ?? "Não deu para criar.");
    router.push(`/automations/${d.id}`);
  }

  const lista = dados?.automacoes ?? [];
  const k = dados?.kpis;
  // Busca e filtros rodam sobre a lista já carregada (a API devolve todas).
  const termo = busca.trim().toLocaleLowerCase("pt-BR");
  const visiveis = lista.filter(
    (a) =>
      (!termo || a.nome.toLocaleLowerCase("pt-BR").includes(termo)) &&
      (!status.length || status.includes(a.status)) &&
      (!objetos.length || objetos.includes(a.objeto))
  );
  const nFiltros = status.length + objetos.length;
  const alternar = <T,>(l: T[], v: T) => (l.includes(v) ? l.filter((x) => x !== v) : [...l, v]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
      {/* Barra da tela: título e contagem; ajuda, Modelos e a ação principal à direita. */}
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">Automações</h1>
        {dados && <span className="font-mono text-caption tabular-nums text-text-tertiary">{lista.length} no total</span>}
        <div className="ml-auto flex items-center gap-2">
          <IconButton
            aria-label="Como funcionam as automações"
            tooltip="Quando algo acontece no CRM, a Eva faz o resto: move o negócio, cria a tarefa, avisa a equipe e fala com o cliente."
          >
            <CircleHelp />
          </IconButton>
          <Button variant="secondary" onClick={() => setGaleria(true)} disabled={!dados?.disponivel}>
            <BookOpen size={14} aria-hidden="true" /> Modelos
          </Button>
          <Button variant="primary" onClick={() => setGaleria(true)} disabled={!dados?.disponivel}>
            <Plus size={14} aria-hidden="true" /> Nova automação
          </Button>
        </div>
      </div>

      {/* Busca + "Filtros" (status e tipo de registro moram aqui). */}
      <div className="flex items-center gap-2">
        <SearchInput aria-label="Buscar automação" placeholder="Buscar automação" value={busca} onValueChange={setBusca} className="w-full max-w-xs" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" aria-label={nFiltros ? `Filtros, ${nFiltros} ligados` : "Filtros"}>
              <ListFilter size={14} aria-hidden="true" />
              Filtros
              {nFiltros > 0 && <span className="font-mono text-caption tabular-nums text-accent-fg">{nFiltros}</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>Status</DropdownMenuLabel>
            {FILTROS_DE_STATUS.map((f) => (
              <DropdownMenuCheckboxItem key={f.valor} checked={status.includes(f.valor)} onSelect={(e) => e.preventDefault()} onCheckedChange={() => setStatus((l) => alternar(l, f.valor))}>
                {f.rotulo}
              </DropdownMenuCheckboxItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Registro</DropdownMenuLabel>
            {OBJETOS.map((o) => (
              <DropdownMenuCheckboxItem key={o} checked={objetos.includes(o)} onSelect={(e) => e.preventDefault()} onCheckedChange={() => setObjetos((l) => alternar(l, o))}>
                {NOMES_DOS_OBJETOS[o].plural}
              </DropdownMenuCheckboxItem>
            ))}
            {nFiltros > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => {
                    setStatus([]);
                    setObjetos([]);
                  }}
                >
                  Limpar filtros
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {dados && !dados.disponivel && <Notice tone="warning">{dados.aviso ?? "As automações ainda não foram ativadas neste ambiente."}</Notice>}

      {/* Os números do dia; o tempo médio vira apoio das execuções. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Numero rotulo="Execuções hoje" valor={k ? String(k.execucoesHoje) : "—"} apoio={k?.tempoMedioMs != null ? `${duracao(k.tempoMedioMs)} em média` : undefined} />
        <Numero rotulo="Erros hoje" valor={k ? String(k.errosHoje) : "—"} tom={k && k.errosHoje > 0 ? "erro" : undefined} />
        <Numero rotulo="Ligadas" valor={k ? String(k.ativas) : "—"} apoio={dados ? `de ${lista.length}` : undefined} />
      </div>

      {!dados ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando automações">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none" />
          ))}
        </div>
      ) : dados.disponivel && lista.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-6">
          <p className="text-small text-text-secondary">Nenhuma automação ainda. Comece por um modelo: lead novo no WhatsApp, proposta sem resposta, negócio parado.</p>
          <Button variant="secondary" onClick={() => setGaleria(true)}>
            <Plus size={14} aria-hidden="true" /> Escolher um modelo
          </Button>
        </div>
      ) : lista.length > 0 && visiveis.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-6">
          <p className="text-small text-text-secondary">Nenhuma automação com esses filtros.</p>
          <Button
            variant="secondary"
            onClick={() => {
              setBusca("");
              setStatus([]);
              setObjetos([]);
            }}
          >
            Limpar busca e filtros
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col" aria-label="Automações">
          {visiveis.map((a) => {
            const Icone = ICONE_DO_OBJETO[a.objeto] ?? Workflow;
            const s = STATUS_DA_AUTOMACAO[a.status] ?? STATUS_DA_AUTOMACAO.rascunho;
            const pausada = a.status === "pausada" && !!a.pausadaPor;
            const comErros = a.status === "ativa" && a.erros30d > 0;
            const frase = fraseDaAutomacao(a.rascunho, nomes);
            return (
              <li key={a.id} className="border-b border-border-subtle last:border-b-0">
                <Link
                  href={`/automations/${a.id}`}
                  className="grid min-h-[60px] grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-[14px] px-2 py-2 transition-colors hover:bg-raised sm:gap-4"
                >
                  <span className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-border-subtle bg-raised text-text-secondary" title={NOMES_DOS_OBJETOS[a.objeto]?.plural}>
                    <Icone size={16} aria-hidden="true" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="truncate text-small font-medium text-text-primary">{a.nome}</span>
                    {pausada ? (
                      <span className="truncate text-caption text-warning">{a.pausadaPor}</span>
                    ) : (
                      <span className="flex min-w-0 items-center gap-1.5 text-caption text-text-tertiary" title={frase}>
                        {a.origem === "regra_rapida" && <span className="shrink-0 font-mono">regra rápida ·</span>}
                        <span className="truncate">{frase}</span>
                      </span>
                    )}
                  </span>
                  {comErros ? (
                    <Badge variant="danger" dot title="Erros nos últimos 30 dias">
                      {a.erros30d} {a.erros30d === 1 ? "erro" : "erros"}
                    </Badge>
                  ) : (
                    <Badge variant={s.variante} dot={s.variante !== "neutral"}>
                      {s.rotulo}
                    </Badge>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <Galeria aberta={galeria} fechar={() => setGaleria(false)} criar={criar} />
    </div>
  );
}
