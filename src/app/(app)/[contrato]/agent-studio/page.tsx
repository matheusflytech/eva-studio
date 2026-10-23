"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { Ellipsis, ListFilter, MessageSquare, PlayCircle, Plus } from "lucide-react";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { AgentEmptyState } from "@/components/agent-studio/agent-empty-state";
import {
  CartaoDoAgente,
  LinhaDoAgente,
  precisaDeVoce,
  situacaoDoAgente,
  type AgentOverview,
  type SituacaoDoAgente,
} from "@/components/agent-studio/agent-operations-card";
import { Button, buttonVariants } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { SearchInput } from "@/components/ui/search-input";
import { Notice } from "@/components/ui/notice";
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

interface EstadoWorker {
  ultimaBatida: string | null;
  segundosAtras: number | null;
  saudavel: boolean;
  batidas: number;
}

interface Resumo {
  total: number;
  ativos: number;
  rascunhos: number;
  conversas7d: number;
  aguardandoHumano: number;
  erros24h: number;
  pendencias: number;
  mensagensContato7d: number;
  mensagensAgente7d: number;
}

type Aba = "todos" | "atencao";

const SITUACOES: { valor: SituacaoDoAgente; rotulo: string }[] = [
  { valor: "atendendo", rotulo: "Atendendo" },
  { valor: "rascunho", rotulo: "Rascunho" },
  { valor: "pausado", rotulo: "Pausado" },
];

// ---------------------------------------------------------------------------
// Agentes de IA (v5). A tela responde "algum agente precisa de mim?": duas
// abas (Todos e Precisam de você), busca e Filtros. Os números de operação
// (respostas, execuções, erros) saíram da frente e moram no Resumo de cada
// agente; quem espera atendente aparece na própria linha do agente.
// ---------------------------------------------------------------------------

export default function AgentStudioPage() {
  const { agents, isLoaded, load } = useAgentsStore();
  const [overview, setOverview] = React.useState<AgentOverview[] | null>(null);
  const [resumo, setResumo] = React.useState<Resumo | null>(null);
  const [worker, setWorker] = React.useState<EstadoWorker | null>(null);
  const [busca, setBusca] = React.useState("");
  const [aba, setAba] = React.useState<Aba>("todos");
  // Rascunho, atendendo, pausado: filtro de status dentro do botão Filtros.
  const [situacoes, setSituacoes] = React.useState<SituacaoDoAgente[]>([]);

  React.useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Estado de operação muda sozinho (conversa entrando, erro acontecendo),
  // então recarrega periodicamente em vez de exigir F5.
  React.useEffect(() => {
    let vivo = true;
    async function puxar() {
      try {
        const res = await fetch("/api/agents/overview");
        if (!res.ok || !vivo) return;
        const data = await res.json();
        setOverview(data.agents ?? []);
        setResumo(data.resumo ?? null);
        setWorker(data.worker ?? null);
      } catch {
        // rede caiu: mantém o que já está na tela
      }
    }
    puxar();
    const t = setInterval(puxar, 20000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  if (!isLoaded) return <div className="flex-1" />;

  if (agents.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
        <div className="flex min-h-10 items-center">
          <h1 className="text-heading font-semibold tracking-tight text-text-primary">Agentes de IA</h1>
        </div>
        <AgentEmptyState />
      </div>
    );
  }

  const lista = overview ?? [];
  const termo = busca.trim().toLowerCase();
  const precisandoAtencao = lista.filter(precisaDeVoce).length;

  // Quem precisa de você vem primeiro; dentro de cada grupo, a ordem da API.
  const filtrados = lista
    .filter((a) => {
      if (termo && !`${a.name} ${a.description}`.toLowerCase().includes(termo)) return false;
      if (aba === "atencao" && !precisaDeVoce(a)) return false;
      if (situacoes.length > 0 && !situacoes.includes(situacaoDoAgente(a))) return false;
      return true;
    })
    .sort((a, b) => Number(precisaDeVoce(b)) - Number(precisaDeVoce(a)));

  function alternarSituacao(s: SituacaoDoAgente) {
    setSituacoes((atual) => (atual.includes(s) ? atual.filter((x) => x !== s) : [...atual, s]));
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
      {/* Barra da tela: título, quantos atendem e, à direita, "…" e a ação principal. */}
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">Agentes de IA</h1>
        <span className="font-mono text-caption tabular-nums text-text-tertiary">
          {resumo
            ? `${resumo.ativos} atendendo`
            : `${agents.length} ${agents.length === 1 ? "agente" : "agentes"}`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label="Mais: testar no Playground, ver conversas" variant="secondary">
                <Ellipsis />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuItem asChild>
                <Link href="/playground">
                  <PlayCircle aria-hidden="true" /> Testar no Playground
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/conversas">
                  <MessageSquare aria-hidden="true" /> Conversas esperando atendente
                  {resumo && resumo.aguardandoHumano > 0 && (
                    <span className="ml-auto font-mono text-caption tabular-nums text-danger">{resumo.aguardandoHumano}</span>
                  )}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link href="/agent-studio/new" className={buttonVariants({ variant: "primary", size: "md" })}>
            <Plus size={15} aria-hidden="true" /> Novo agente
          </Link>
        </div>
      </div>

      {worker && !worker.saudavel && (
        <Notice tone="warning">
          <p className="font-medium">
            {worker.ultimaBatida
              ? `O relógio do produto não bate há ${formatarEspera(worker.segundosAtras)}.`
              : "O relógio do produto nunca bateu."}
          </p>
          <p className="mt-0.5 text-text-secondary">
            Sequências e disparos agendados ficam parados na fila. Quem bate é o{" "}
            <code className="font-mono text-caption">pg_cron</code> do Supabase, de minuto em minuto; o SQL está em{" "}
            <code className="font-mono text-caption">prisma/relogio.sql</code>.
          </p>
        </Notice>
      )}

      {/* Abas, busca e Filtros numa linha só. */}
      <div className="flex flex-wrap items-center gap-2">
        <div role="tablist" aria-label="Agentes" className="inline-flex h-8 items-center rounded-full border border-border-subtle bg-raised p-0.5">
          {([
            { k: "todos", l: "Todos", n: lista.length },
            { k: "atencao", l: "Precisam de você", n: precisandoAtencao },
          ] as const).map((t) => {
            const ativa = aba === t.k;
            return (
              <button
                key={t.k}
                type="button"
                role="tab"
                aria-selected={ativa}
                onClick={() => setAba(t.k)}
                className={cn(
                  "inline-flex h-full items-center gap-1.5 whitespace-nowrap rounded-full px-3 text-small transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  ativa ? "bg-inverse font-medium text-inverse-fg" : "text-text-secondary hover:text-text-primary"
                )}
              >
                {t.l}
                <span
                  className={cn(
                    "font-mono text-caption tabular-nums",
                    t.k === "atencao" && t.n > 0
                      ? "rounded-full bg-danger-solid px-1.5 text-text-on-danger"
                      : ativa ? "opacity-60" : "text-text-tertiary"
                  )}
                >
                  {t.n}
                </span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <SearchInput
            aria-label="Buscar agente"
            placeholder="Buscar agente"
            value={busca}
            onValueChange={setBusca}
            className="w-40 sm:w-56"
          />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                aria-label={situacoes.length ? `Filtros, ${situacoes.length} ligados` : "Filtros"}
              >
                <ListFilter size={14} aria-hidden="true" />
                <span className="hidden sm:inline">Filtros</span>
                {situacoes.length > 0 && (
                  <span className="font-mono text-caption tabular-nums text-accent-fg">{situacoes.length}</span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuLabel>Status</DropdownMenuLabel>
              {SITUACOES.map((s) => (
                <DropdownMenuCheckboxItem
                  key={s.valor}
                  checked={situacoes.includes(s.valor)}
                  onCheckedChange={() => alternarSituacao(s.valor)}
                  // Fica aberto para marcar mais de um.
                  onSelect={(e) => e.preventDefault()}
                >
                  {s.rotulo}
                </DropdownMenuCheckboxItem>
              ))}
              {situacoes.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setSituacoes([])} className="text-accent-fg">
                    Limpar filtros
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Ocupa a largura do cabeçalho. No desktop (≥1280px) vira grade de
          cartões, que não deixa a tela vazia com poucos agentes; abaixo disso,
          a lista de linhas. */}
      <div className="w-full">
        {overview === null ? (
          <div className="flex flex-col gap-2 xl:grid xl:grid-cols-3 xl:gap-3" aria-label="Carregando agentes">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-[68px] animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none xl:h-[188px] xl:rounded-[18px]"
              />
            ))}
          </div>
        ) : filtrados.length === 0 ? (
          <p className="py-10 text-center text-small text-text-secondary">
            {termo
              ? "Nenhum agente com esse termo."
              : aba === "atencao"
                ? "Nada pedindo você agora."
                : "Nenhum agente com esses filtros."}
          </p>
        ) : (
          <>
            <div className="flex flex-col divide-y divide-border-subtle xl:hidden">
              {filtrados.map((a) => (
                <LinhaDoAgente key={a.id} agent={a} />
              ))}
            </div>
            <div className="hidden grid-cols-3 gap-3 xl:grid">
              {filtrados.map((a) => (
                <CartaoDoAgente key={a.id} agent={a} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** "há 3 minutos" em vez de 180 segundos. */
function formatarEspera(segundos: number | null): string {
  if (segundos === null) return "um tempo";
  if (segundos < 120) return `${segundos} segundos`;
  const min = Math.round(segundos / 60);
  if (min < 120) return `${min} minutos`;
  const horas = Math.round(min / 60);
  if (horas < 48) return `${horas} horas`;
  return `${Math.round(horas / 24)} dias`;
}
