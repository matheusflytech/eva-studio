"use client";

import * as React from "react";
import Link from "next/link";
import { Plus, Search, AlertTriangle, UserCheck, MessageSquare, Bot, RadioTower } from "lucide-react";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { AgentEmptyState } from "@/components/agent-studio/agent-empty-state";
import { AgentOperationsCard, type AgentOverview } from "@/components/agent-studio/agent-operations-card";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

type Filtro = "todos" | "atencao" | "rascunho";

export default function AgentStudioPage() {
  const { agents, isLoaded, load } = useAgentsStore();
  const [overview, setOverview] = React.useState<AgentOverview[] | null>(null);
  const [resumo, setResumo] = React.useState<Resumo | null>(null);
  const [worker, setWorker] = React.useState<EstadoWorker | null>(null);
  const [busca, setBusca] = React.useState("");
  const [filtro, setFiltro] = React.useState<Filtro>("todos");

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

  if (!isLoaded) return <div className="flex-1 p-8" />;

  if (agents.length === 0) {
    return (
      <div className="flex flex-1 flex-col p-6">
        <AgentEmptyState />
      </div>
    );
  }

  const lista = overview ?? [];
  const termo = busca.trim().toLowerCase();

  const filtrados = lista.filter((a) => {
    if (termo && !`${a.name} ${a.description}`.toLowerCase().includes(termo)) return false;
    if (filtro === "atencao") return a.aguardandoHumano > 0 || a.erros24h > 0 || a.pendencias > 0;
    if (filtro === "rascunho") return a.emRascunho;
    return true;
  });

  const precisandoAtencao = lista.filter(
    (a) => a.aguardandoHumano > 0 || a.erros24h > 0 || a.pendencias > 0
  ).length;

  return (
    <div className="flex-1 p-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-primary">Agentes de IA</h1>
          <p className="mt-1 text-[14px] text-text-secondary">
            {resumo
              ? `${resumo.ativos} atendendo · ${resumo.rascunhos} em rascunho`
              : `${agents.length} ${agents.length === 1 ? "agente" : "agentes"}`}
          </p>
        </div>
        <Link href="/agent-studio/new" className={buttonVariants({ variant: "solid", size: "md" })}>
          <Plus size={16} /> Novo agente
        </Link>
      </div>

      {worker && !worker.saudavel && (
        <div className="mb-5 flex flex-wrap items-start gap-3 rounded-2xl bg-amber-400/10 px-4 py-3.5 ring-1 ring-amber-400/25">
          <RadioTower size={16} className="mt-0.5 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-medium text-amber-300">
              {worker.ultimaBatida
                ? `O relógio do produto não bate há ${formatarEspera(worker.segundosAtras)}.`
                : "O relógio do produto nunca bateu."}
            </p>
            <p className="mt-1 text-[12.5px] text-text-secondary">
              Sem ele, passo de sequência vencido e disparo agendado ficam parados na fila: a hora chega e
              ninguém entrega. Quem bate é o <code className="font-mono text-[11.5px]">pg_cron</code> do Supabase,
              de minuto em minuto — o SQL que agenda está em{" "}
              <code className="font-mono text-[11.5px]">prisma/relogio.sql</code>.
            </p>
          </div>
        </div>
      )}

      {/* Resumo da operação. O que precisa de gente vem primeiro, porque é a
          única linha que pede ação agora. */}
      {resumo && (
        <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile
            icon={<UserCheck size={14} />}
            valor={resumo.aguardandoHumano}
            rotulo="esperando atendente"
            alerta={resumo.aguardandoHumano > 0}
            href="/conversas"
          />
          <Tile icon={<MessageSquare size={14} />} valor={resumo.conversas7d} rotulo="conversas nos 7 dias" />
          <Tile
            icon={<Bot size={14} />}
            valor={resumo.mensagensAgente7d}
            rotulo="respostas do agente 7d"
            sub={resumo.mensagensContato7d > 0
              ? `para ${resumo.mensagensContato7d} mensagens recebidas`
              : undefined}
          />
          <Tile
            icon={<AlertTriangle size={14} />}
            valor={resumo.erros24h + resumo.pendencias}
            rotulo="erros e pendências"
            alerta={resumo.erros24h + resumo.pendencias > 0}
            sub={resumo.erros24h > 0 ? `${resumo.erros24h} erro(s) nas últimas 24h` : undefined}
          />
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder="Buscar agente..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1.5">
          {([
            { k: "todos", l: `Todos (${lista.length})` },
            { k: "atencao", l: `Precisam de atenção (${precisandoAtencao})` },
            { k: "rascunho", l: `Rascunhos (${resumo?.rascunhos ?? 0})` },
          ] as const).map((f) => (
            <button
              key={f.k}
              type="button"
              onClick={() => setFiltro(f.k)}
              className={cn(
                "rounded-xl px-3 py-2 text-[12.5px] transition-colors",
                filtro === f.k
                  ? "bg-ice font-semibold text-bg-base"
                  : "bg-surface-2 text-text-secondary hover:text-text-primary"
              )}
            >
              {f.l}
            </button>
          ))}
        </div>
      </div>

      {overview === null ? (
        <p className="text-[13px] text-text-tertiary">Carregando estado dos agentes...</p>
      ) : filtrados.length === 0 ? (
        <p className="glass-card rounded-3xl px-6 py-14 text-center text-[13.5px] text-text-secondary">
          {filtro === "atencao"
            ? "Nada pedindo atenção agora."
            : filtro === "rascunho"
              ? "Nenhum rascunho: todos os agentes têm canal e fluxo."
              : "Nenhum agente com esse termo."}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {filtrados.map((a) => (
            <AgentOperationsCard key={a.id} agent={a} />
          ))}
        </div>
      )}
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

function Tile({
  icon, valor, rotulo, sub, alerta, href,
}: {
  icon: React.ReactNode;
  valor: number;
  rotulo: string;
  sub?: string;
  alerta?: boolean;
  href?: string;
}) {
  const corpo = (
    <div
      className={cn(
        "glass-card rounded-2xl px-4 py-4 transition-colors",
        alerta && "ring-1 ring-amber-400/25",
        href && "hover:border-border-strong"
      )}
    >
      <div className="flex items-center gap-1.5 text-[11.5px] text-text-tertiary">{icon} {rotulo}</div>
      <div
        className={cn(
          "mt-1.5 font-display text-[26px] font-semibold tabular-nums",
          alerta ? "text-amber-300" : valor === 0 ? "text-text-tertiary" : "text-text-primary"
        )}
      >
        {valor}
      </div>
      {sub && <div className="mt-0.5 text-[11px] text-text-tertiary">{sub}</div>}
    </div>
  );
  return href ? <Link href={href}>{corpo}</Link> : corpo;
}
