"use client";

import * as React from "react";
import Link from "next/link";
import {
  Aperture, AlertTriangle, Sparkles, FileText, MessageSquare,
  UserCheck, Activity, ArrowRight, Wrench, PlugZap, PlayCircle, CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatRelativeDate } from "@/lib/utils";

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

const CANAL_COR: Record<string, string> = {
  whatsapp_qr: "bg-emerald-400",
  whatsapp_meta: "bg-emerald-400",
  instagram: "bg-pink-400",
  telegram: "bg-sky-400",
  messenger: "bg-blue-400",
  tiktok: "bg-text-secondary",
  website: "bg-text-tertiary",
};

interface ProximoPasso {
  texto: string;
  href: string;
  tom: "urgente" | "atencao" | "neutro" | "ok";
  icone: React.ReactNode;
}

/**
 * O que fazer com este agente agora. Um só, nunca uma lista.
 *
 * A tela já dizia o estado; dizer o estado e deixar a pessoa deduzir a ação é
 * meio caminho. A ordem abaixo é a de quem perde mais se for ignorado: gente
 * esperando resposta primeiro, depois erro, e só então as coisas que só
 * atrasam o lançamento do agente.
 */
function proximoPasso(agent: AgentOverview): ProximoPasso {
  if (agent.aguardandoHumano > 0) {
    return {
      texto:
        agent.aguardandoHumano === 1
          ? "Uma pessoa está esperando atendimento"
          : `${agent.aguardandoHumano} pessoas estão esperando atendimento`,
      href: "/conversas",
      tom: "urgente",
      icone: <UserCheck size={13} />,
    };
  }
  if (agent.erros24h > 0) {
    return {
      texto: `${agent.erros24h} execução(ões) falharam nas últimas 24h`,
      href: `/agent-studio/${agent.id}/builder`,
      tom: "urgente",
      icone: <AlertTriangle size={13} />,
    };
  }
  if (!agent.temFluxo) {
    return {
      texto: "Monte o fluxo: sem ele o agente não responde nada",
      href: `/agent-studio/${agent.id}/builder`,
      tom: "atencao",
      icone: <Wrench size={13} />,
    };
  }
  if (agent.pendencias > 0) {
    return {
      texto: `${agent.pendencias} ${agent.pendencias === 1 ? "bloco incompleto" : "blocos incompletos"} no fluxo`,
      href: `/agent-studio/${agent.id}/builder`,
      tom: "atencao",
      icone: <AlertTriangle size={13} />,
    };
  }
  if (agent.canais.length === 0) {
    return {
      texto: "Conecte um canal: o fluxo está pronto e ninguém alcança ele",
      href: `/agent-studio/${agent.id}?aba=canais`,
      tom: "atencao",
      icone: <PlugZap size={13} />,
    };
  }
  if (agent.conversasTotal === 0) {
    return {
      texto: "Nunca conversou com ninguém. Teste no Playground",
      href: `/playground?agent=${agent.id}`,
      tom: "neutro",
      icone: <PlayCircle size={13} />,
    };
  }
  return {
    texto: "No ar, sem nada pendente",
    href: `/agent-studio/${agent.id}`,
    tom: "ok",
    icone: <CheckCircle2 size={13} />,
  };
}

const TOM: Record<ProximoPasso["tom"], string> = {
  urgente: "bg-danger/10 text-danger hover:bg-danger/15",
  atencao: "bg-amber-400/10 text-amber-300 hover:bg-amber-400/15",
  neutro: "bg-surface-2 text-text-secondary hover:bg-surface-3",
  ok: "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15",
};

/**
 * Cartão de operação de um agente.
 *
 * O cartão antigo mostrava nome, descrição e data: respondia "quais agentes
 * existem" e nenhuma das perguntas do dia a dia. Aqui o estado vem primeiro,
 * e o que precisa de atenção tem forma própria, não só número.
 */
export function AgentOperationsCard({ agent }: { agent: AgentOverview }) {
  const precisaAtencao = agent.aguardandoHumano > 0 || agent.erros24h > 0 || agent.pendencias > 0;
  const passo = proximoPasso(agent);

  return (
    <div
      className={cn(
        "glass-card group relative flex flex-col rounded-3xl p-5 transition-colors",
        precisaAtencao ? "ring-1 ring-amber-400/25" : "hover:border-border-strong"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-text-secondary">
            <Aperture size={19} />
          </span>
          <div className="min-w-0">
            <Link
              href={`/agent-studio/${agent.id}`}
              className="block truncate font-display text-[16px] font-semibold text-text-primary hover:text-accent-400"
            >
              {agent.name}
            </Link>
            <p className="truncate text-[12px] text-text-tertiary">
              {agent.description || "Sem descrição."}
            </p>
          </div>
        </div>

        {agent.emRascunho ? (
          <Badge>Rascunho</Badge>
        ) : (
          <Badge variant={agent.status === "active" ? "success" : "neutral"}>
            {agent.status === "active" ? "Atendendo" : "Pausado"}
          </Badge>
        )}
      </div>

      {/* Canais ligados. Sem canal, o agente não atende ninguém, e dizer isso
          em texto vale mais que mostrar um contador zerado. */}
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        {agent.canais.length === 0 ? (
          <span className="text-[12px] text-text-tertiary">Nenhum canal conectado</span>
        ) : (
          agent.canais.map((c) => (
            <span
              key={c.id}
              title={c.detalhe}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] text-text-secondary"
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", CANAL_COR[c.id] ?? "bg-text-tertiary")} />
              {c.label}
            </span>
          ))
        )}
      </div>

      {/* Números de operação, com a semana ao lado pra o número ter contexto */}
      <div className="mt-5 flex items-end justify-between gap-4 border-t border-border-subtle pt-4">
        <div className="grid flex-1 grid-cols-3 gap-3">
        <Metrica icon={<MessageSquare size={13} />} valor={agent.conversas7d} rotulo="conversas 7d" />
        <Metrica
          icon={<UserCheck size={13} />}
          valor={agent.aguardandoHumano}
          rotulo="esperando você"
          alerta={agent.aguardandoHumano > 0}
        />
        <Metrica
          icon={<Activity size={13} />}
          valor={agent.execucoes24h}
          rotulo="execuções 24h"
          sub={agent.erros24h > 0 ? `${agent.erros24h} com erro` : undefined}
          alerta={agent.erros24h > 0}
        />
        </div>
        <Serie valores={agent.serie7d ?? []} />
      </div>

      {/* Configuração: o que este agente sabe e com que modelo pensa */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11.5px] text-text-tertiary">
        {agent.modelos.length > 0 ? (
          agent.modelos.map((m) => (
            <span key={m} className="inline-flex items-center gap-1.5">
              <Sparkles size={12} className="text-accent-400" /> {m}
            </span>
          ))
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Sparkles size={12} /> sem bloco de IA
          </span>
        )}
        {agent.documentos > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <FileText size={12} /> {agent.documentos} doc
            {agent.buscaSemantica && <span className="text-accent-400">· semântica</span>}
          </span>
        )}
        <span className="inline-flex items-center gap-1.5">
          <Wrench size={12} /> {agent.temFluxo ? `${agent.blocos} blocos` : "sem fluxo"}
        </span>
      </div>

      <Link
        href={passo.href}
        className={cn(
          "mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-[12px] font-medium transition-colors",
          TOM[passo.tom]
        )}
      >
        {passo.icone}
        <span className="min-w-0 flex-1 truncate">{passo.texto}</span>
        {passo.tom !== "ok" && <ArrowRight size={13} className="shrink-0" />}
      </Link>

      <div className="mt-auto flex items-center justify-between gap-3 border-t border-border-subtle pt-4 text-[11.5px] text-text-tertiary">
        <span>
          {agent.ultimaAtividadeAt
            ? `última conversa ${formatRelativeDate(agent.ultimaAtividadeAt)}`
            : `editado ${formatRelativeDate(agent.updatedAt)}`}
        </span>
        <Link
          href={`/agent-studio/${agent.id}/builder`}
          className="inline-flex items-center gap-1 font-medium text-text-secondary transition-colors hover:text-text-primary"
        >
          Abrir builder <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

/**
 * Sete dias de conversa em barras.
 *
 * Número sozinho não diz se caiu ou subiu, e "12 conversas" pode ser doze
 * ontem ou duas por dia. Sem altura fixa por barra o gráfico mentiria: a
 * escala é sempre o maior dia da semana.
 */
function Serie({ valores }: { valores: number[] }) {
  const maior = Math.max(1, ...valores);
  const dias = ["D", "S", "T", "Q", "Q", "S", "S"];
  const hojeIdx = new Date().getDay();

  return (
    <div className="flex items-end gap-[3px]" aria-hidden="true">
      {valores.map((v, i) => (
        <span
          key={i}
          title={`${v} conversa(s)`}
          className="flex w-[9px] flex-col items-center gap-1"
        >
          <span
            className={cn(
              "w-full rounded-sm transition-colors",
              v === 0 ? "bg-surface-3" : "bg-accent-500/70"
            )}
            style={{ height: Math.max(2, Math.round((v / maior) * 22)) }}
          />
          <span className="text-[8.5px] leading-none text-text-tertiary/60">
            {dias[(hojeIdx - (6 - i) + 7) % 7]}
          </span>
        </span>
      ))}
    </div>
  );
}

function Metrica({
  icon, valor, rotulo, sub, alerta,
}: {
  icon: React.ReactNode;
  valor: number;
  rotulo: string;
  sub?: string;
  alerta?: boolean;
}) {
  return (
    <div>
      <div
        className={cn(
          "flex items-baseline gap-1.5 font-display text-[19px] font-semibold tabular-nums",
          alerta ? "text-amber-300" : valor === 0 ? "text-text-tertiary" : "text-text-primary"
        )}
      >
        {valor}
      </div>
      <div className="mt-0.5 flex items-center gap-1 text-[11px] text-text-tertiary">
        {icon} {rotulo}
      </div>
      {sub && <div className="mt-0.5 text-[10.5px] text-amber-300/80">{sub}</div>}
    </div>
  );
}
