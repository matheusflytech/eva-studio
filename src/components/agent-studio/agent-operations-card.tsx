"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import {
  AlertTriangle, ArrowRight, ChevronRight, PencilLine, PlayCircle, PlugZap, UserCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { OrbeDoAgente } from "@/components/agent-studio/orbe-do-agente";
import { cn } from "@/lib/utils";

export interface AgentOverview {
  id: string;
  name: string;
  description: string;
  status: string;
  updatedAt: string;
  canais: { id: string; label: string; detalhe: string }[];
  emRascunho: boolean;
  conversas7d: number;
  conversasTotal: number;
  serie7d: number[];
  ultimaAtividadeAt: string | null;
  aguardandoHumano: number;
  execucoes24h: number;
  erros24h: number;
  blocos: number;
  pendencias: number;
  temFluxo: boolean;
  modelos: string[];
  buscaSemantica: boolean;
  documentos: number;
  modelosMensagem: number;
}

/** Situação do agente na lista: rascunho, atendendo ou pausado. */
export type SituacaoDoAgente = "rascunho" | "atendendo" | "pausado";

export function situacaoDoAgente(agent: AgentOverview): SituacaoDoAgente {
  if (agent.emRascunho) return "rascunho";
  return agent.status === "active" ? "atendendo" : "pausado";
}

/** Gente esperando, erro ou bloco incompleto: o que põe o agente em "Precisam de você". */
export function precisaDeVoce(agent: AgentOverview): boolean {
  return agent.aguardandoHumano > 0 || agent.erros24h > 0 || agent.pendencias > 0;
}

interface ProximoPasso {
  texto: string;
  href: string;
  tom: "urgente" | "atencao" | "neutro" | "ok";
  icone: React.ReactNode;
}

/**
 * O que fazer com este agente agora. Um só, nunca uma lista.
 *
 * A ordem é a de quem perde mais se for ignorado: gente esperando resposta
 * primeiro, depois erro, e só então as coisas que só atrasam o lançamento.
 */
function proximoPasso(agent: AgentOverview): ProximoPasso {
  if (agent.aguardandoHumano > 0) {
    return {
      texto:
        agent.aguardandoHumano === 1
          ? "Uma pessoa esperando atendimento"
          : `${agent.aguardandoHumano} pessoas esperando atendimento`,
      href: "/conversas",
      tom: "urgente",
      icone: <UserCheck size={13} aria-hidden="true" />,
    };
  }
  if (agent.erros24h > 0) {
    return {
      texto: `${agent.erros24h} ${agent.erros24h === 1 ? "execução falhou" : "execuções falharam"} nas últimas 24h`,
      href: `/agent-studio/${agent.id}/builder`,
      tom: "urgente",
      icone: <AlertTriangle size={13} aria-hidden="true" />,
    };
  }
  if (!agent.temFluxo) {
    return {
      texto: "Monte o fluxo para ele responder",
      href: `/agent-studio/${agent.id}/builder`,
      tom: "atencao",
      icone: <PencilLine size={13} aria-hidden="true" />,
    };
  }
  if (agent.pendencias > 0) {
    return {
      texto: `${agent.pendencias} ${agent.pendencias === 1 ? "bloco incompleto" : "blocos incompletos"}`,
      href: `/agent-studio/${agent.id}/builder`,
      tom: "atencao",
      icone: <AlertTriangle size={13} aria-hidden="true" />,
    };
  }
  if (agent.canais.length === 0) {
    return {
      texto: "Conecte um canal",
      href: `/agent-studio/${agent.id}?aba=canais`,
      tom: "atencao",
      icone: <PlugZap size={13} aria-hidden="true" />,
    };
  }
  if (agent.conversasTotal === 0) {
    return {
      texto: "Nunca conversou. Teste no Playground",
      href: `/playground?agent=${agent.id}`,
      tom: "neutro",
      icone: <PlayCircle size={13} aria-hidden="true" />,
    };
  }
  return { texto: "Tudo certo", href: `/agent-studio/${agent.id}`, tom: "ok", icone: null };
}

const TOM: Record<ProximoPasso["tom"], string> = {
  urgente: "font-medium text-danger",
  atencao: "text-warning",
  neutro: "text-text-secondary",
  ok: "text-text-tertiary",
};

/**
 * Linha de um agente na lista (v5): quatro coisas só. Orbe (leve), nome com o
 * próximo passo, conversas da semana e status. Modelo, blocos, canais,
 * execuções e erros ficam no Resumo do agente.
 *
 * A linha inteira abre o agente (link esticado por baixo); o próximo passo é
 * um link próprio por cima, que leva direto aonde se resolve.
 */
export function LinhaDoAgente({ agent }: { agent: AgentOverview }) {
  const passo = proximoPasso(agent);
  const situacao = situacaoDoAgente(agent);
  const n = agent.conversas7d;

  return (
    <div className="group relative flex min-h-[68px] items-center gap-3.5 rounded-[14px] px-2 py-2.5 transition-colors hover:bg-raised">
      <Link
        href={`/agent-studio/${agent.id}`}
        aria-label={`Abrir ${agent.name}`}
        className="absolute inset-0 rounded-[14px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
      <OrbeDoAgente agenteId={agent.id} tamanho={36} leve className="mx-px" />

      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="truncate text-body font-medium text-text-primary">{agent.name}</span>
        <TextoDoPasso passo={passo} />
      </div>

      <span
        className={cn(
          "hidden w-[110px] shrink-0 text-right text-small tabular-nums sm:block",
          n === 0 ? "text-text-tertiary" : "text-text-secondary"
        )}
        title="Conversas nos últimos 7 dias"
      >
        {n === 0 ? "sem conversas" : `${n} ${n === 1 ? "conversa" : "conversas"}`}
      </span>

      <span className="flex w-[96px] shrink-0 justify-end">
        {situacao === "atendendo" ? (
          <Badge variant="success" dot>Atendendo</Badge>
        ) : (
          <Badge>{situacao === "rascunho" ? "Rascunho" : "Pausado"}</Badge>
        )}
      </span>
      <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-text-tertiary" />
    </div>
  );
}

/** Próximo passo: link próprio (por cima do link do cartão/linha) ou, se está tudo certo, só o texto. */
function TextoDoPasso({ passo }: { passo: ProximoPasso }) {
  if (passo.tom === "ok") return <span className={cn("truncate text-small", TOM.ok)}>{passo.texto}</span>;
  return (
    <Link
      href={passo.href}
      className={cn(
        "relative z-10 inline-flex max-w-full items-center gap-1.5 self-start truncate text-small hover:underline",
        TOM[passo.tom]
      )}
    >
      {passo.icone}
      <span className="truncate">{passo.texto}</span>
      {passo.tom === "urgente" && <ArrowRight size={13} aria-hidden="true" className="shrink-0" />}
    </Link>
  );
}

/**
 * Cartão de um agente na grade do desktop (≥1280px). Os mesmos dados e links
 * da linha: orbe maior, status, nome com o próximo passo e as conversas da
 * semana. O cartão inteiro abre o agente; o próximo passo leva aonde se resolve.
 */
export function CartaoDoAgente({ agent }: { agent: AgentOverview }) {
  const passo = proximoPasso(agent);
  const situacao = situacaoDoAgente(agent);
  const n = agent.conversas7d;

  return (
    <div className="group relative flex min-h-[188px] flex-col gap-4 rounded-[18px] border border-border-subtle bg-panel p-4 transition-colors hover:bg-raised">
      <Link
        href={`/agent-studio/${agent.id}`}
        aria-label={`Abrir ${agent.name}`}
        className="absolute inset-0 rounded-[18px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
      />
      <div className="flex items-start justify-between gap-3">
        <OrbeDoAgente agenteId={agent.id} tamanho={56} leve />
        {situacao === "atendendo" ? (
          <Badge variant="success" dot>Atendendo</Badge>
        ) : (
          <Badge>{situacao === "rascunho" ? "Rascunho" : "Pausado"}</Badge>
        )}
      </div>

      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-body font-semibold text-text-primary">{agent.name}</span>
        <TextoDoPasso passo={passo} />
      </div>

      <div className="mt-auto flex items-center gap-2 border-t border-border-subtle pt-3">
        <span
          className={cn("text-small tabular-nums", n === 0 ? "text-text-tertiary" : "text-text-secondary")}
          title="Conversas nos últimos 7 dias"
        >
          {n === 0 ? "Sem conversas" : `${n} ${n === 1 ? "conversa" : "conversas"}`}
          <span className="text-text-tertiary"> nos últimos 7 dias</span>
        </span>
        <ChevronRight size={15} aria-hidden="true" className="ml-auto shrink-0 text-text-tertiary" />
      </div>
    </div>
  );
}
