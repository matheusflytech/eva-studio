"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2, Circle, ArrowRight, PlayCircle, MessageSquare, Workflow,
  UserCheck, Activity, AlertTriangle, MessagesSquare,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatRelativeDate } from "@/lib/utils";
import type { Agent } from "@/lib/data/types";
import type { AgentOverview } from "@/components/agent-studio/agent-operations-card";
import type { AbaDoAgente } from "@/components/agent-studio/agent-form";

// ---------------------------------------------------------------------------
// A primeira coisa que se vê num agente: ele funciona?
//
// A tela antiga abria direto num formulário de 15 seções. Quem chega aqui quer
// saber três coisas, nesta ordem: o que este agente faz, o que falta para ele
// funcionar de verdade, e como está indo. O resto (editar) fica nas outras abas.
// ---------------------------------------------------------------------------

interface Passo {
  feito: boolean;
  titulo: string;
  detalhe: string;
  /** Aonde ir para resolver. */
  aba?: AbaDoAgente;
  href?: string;
  opcional?: boolean;
}

function montarPassos(agent: Agent, ov: AgentOverview | null): Passo[] {
  const temCanal = (ov?.canais.length ?? 0) > 0;
  return [
    {
      feito: !!ov?.temFluxo && (ov?.pendencias ?? 0) === 0,
      titulo: "Fluxo de conversa montado",
      detalhe: !ov?.temFluxo
        ? "O fluxo diz o que o agente responde em cada situação. Sem ele, não responde nada."
        : (ov?.pendencias ?? 0) > 0
          ? `${ov?.pendencias} bloco(s) incompleto(s) no fluxo.`
          : `${ov?.blocos ?? 0} blocos no fluxo.`,
      href: `/agent-studio/${agent.id}/builder`,
    },
    {
      feito: agent.instructions.trim().length > 20,
      titulo: "Instruções escritas",
      detalhe: "Explica ao agente de IA quem ele é, o que a empresa vende e quando chamar uma pessoa.",
      aba: "comportamento",
    },
    {
      feito: temCanal,
      titulo: "Canal conectado",
      detalhe: temCanal
        ? ov!.canais.map((c) => c.label + (c.detalhe ? ` (${c.detalhe})` : "")).join(", ")
        : "Conecte o WhatsApp, Instagram ou outro canal para os clientes alcançarem o agente.",
      aba: "canais",
    },
    {
      feito: (ov?.conversasTotal ?? 0) > 0,
      titulo: "Testado numa conversa",
      detalhe: (ov?.conversasTotal ?? 0) > 0 ? `${ov?.conversasTotal} conversa(s) até agora.` : "Converse com ele no Playground antes de abrir para clientes.",
      href: `/playground?agent=${agent.id}`,
    },
    {
      feito: (ov?.documentos ?? 0) > 0,
      titulo: "Base de conhecimento",
      detalhe: (ov?.documentos ?? 0) > 0 ? `${ov?.documentos} documento(s) para consultar.` : "Anexe preços, regras e perguntas frequentes para ele responder com precisão.",
      aba: "comportamento",
      opcional: true,
    },
  ];
}

function descreverFuncionamento(agent: Agent, ov: AgentOverview | null): string {
  if (!ov) return "";
  const canais = ov.canais.length > 0 ? ov.canais.map((c) => c.label).join(", ") : "nenhum canal ainda";
  const como =
    ov.modelos.length > 0
      ? `com inteligência artificial (${ov.modelos.join(", ")})`
      : ov.temFluxo
        ? "com um fluxo de mensagens que você montou"
        : "sem fluxo definido";
  return `Atende ${canais}, ${como}. Quando precisa de uma pessoa, a conversa vai para a fila de Conversas.`;
}

export function AgentResumo({ agent, irParaAba }: { agent: Agent; irParaAba: (a: AbaDoAgente) => void }) {
  const [ov, setOv] = React.useState<AgentOverview | null>(null);
  const [carregado, setCarregado] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    fetch("/api/agents/overview")
      .then((r) => r.json())
      .then((d) => {
        if (!vivo) return;
        setOv((d.agents ?? []).find((a: AgentOverview) => a.id === agent.id) ?? null);
        setCarregado(true);
      })
      .catch(() => vivo && setCarregado(true));
    return () => { vivo = false; };
  }, [agent.id]);

  const passos = montarPassos(agent, ov);
  const faltam = passos.filter((p) => !p.feito && !p.opcional).length;
  const pausado = agent.status !== "active";

  return (
    <div className="flex flex-col gap-5">
      <section className="glass-card rounded-3xl p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-medium uppercase tracking-wide text-text-tertiary">O que este agente faz</p>
            <p className="mt-1.5 max-w-[640px] text-[15px] leading-relaxed text-text-primary">
              {carregado ? descreverFuncionamento(agent, ov) || "Sem dados ainda." : "Carregando..."}
            </p>
          </div>
          <div
            className={cn(
              "shrink-0 rounded-xl px-3 py-2 text-[12.5px] font-medium",
              pausado
                ? "bg-surface-3 text-text-secondary"
                : faltam > 0
                  ? "bg-amber-400/10 text-amber-300"
                  : "bg-emerald-500/12 text-emerald-400"
            )}
          >
            {pausado ? "Pausado: não responde" : faltam > 0 ? `Falta${faltam > 1 ? "m" : ""} ${faltam} passo${faltam > 1 ? "s" : ""}` : "No ar e completo"}
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2 border-t border-border-subtle pt-4">
          <Link href={`/playground?agent=${agent.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <PlayCircle size={14} /> Testar no Playground
          </Link>
          <Link href={`/agent-studio/${agent.id}/builder`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <Workflow size={14} /> Editar o fluxo
          </Link>
          <Link href="/conversas" className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <MessageSquare size={14} /> Ver conversas
          </Link>
        </div>
      </section>

      <section className="glass-card rounded-3xl p-5 sm:p-6">
        <h2 className="font-display text-[15px] font-semibold text-text-primary">Para funcionar de verdade</h2>
        <ul className="mt-3 flex flex-col">
          {passos.map((p) => {
            const corpo = (
              <div className="flex items-start gap-3 py-3">
                {p.feito ? (
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-400" />
                ) : (
                  <Circle size={18} className="mt-0.5 shrink-0 text-text-tertiary" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-[13.5px] font-medium", p.feito ? "text-text-secondary" : "text-text-primary")}>{p.titulo}</span>
                    {p.opcional && <span className="rounded-full bg-surface-3 px-2 py-0.5 text-[11px] text-text-tertiary">opcional</span>}
                  </div>
                  <p className="mt-0.5 text-[12.5px] text-text-tertiary">{p.detalhe}</p>
                </div>
                {!p.feito && <ArrowRight size={15} className="mt-1 shrink-0 text-text-tertiary" />}
              </div>
            );
            const classe = "block border-t border-border-subtle first:border-t-0";
            if (p.href) {
              return (
                <li key={p.titulo}>
                  <Link href={p.href} className={cn(classe, "transition-colors hover:bg-surface-2/60")}>{corpo}</Link>
                </li>
              );
            }
            return (
              <li key={p.titulo}>
                <button type="button" onClick={() => p.aba && irParaAba(p.aba)} className={cn(classe, "w-full text-left transition-colors hover:bg-surface-2/60")}>
                  {corpo}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {ov && (
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Numero icone={<MessagesSquare size={14} />} rotulo="conversas nos 7 dias" valor={ov.conversas7d} />
          <Numero
            icone={<UserCheck size={14} />}
            rotulo="esperando atendente"
            valor={ov.aguardandoHumano}
            alerta={ov.aguardandoHumano > 0}
            href="/conversas"
          />
          <Numero icone={<Activity size={14} />} rotulo="execuções nas 24h" valor={ov.execucoes24h} />
          <Numero
            icone={<AlertTriangle size={14} />}
            rotulo="erros nas 24h"
            valor={ov.erros24h}
            alerta={ov.erros24h > 0}
            href={ov.erros24h > 0 ? `/agent-studio/${agent.id}/builder` : undefined}
          />
        </section>
      )}

      <p className="text-[12px] text-text-tertiary">
        Atualizado {formatRelativeDate(agent.updatedAt)}
        {ov?.ultimaAtividadeAt ? `. Última conversa ${formatRelativeDate(ov.ultimaAtividadeAt)}.` : "."}
      </p>
    </div>
  );
}

function Numero({
  icone, rotulo, valor, alerta, href,
}: {
  icone: React.ReactNode;
  rotulo: string;
  valor: number;
  alerta?: boolean;
  href?: string;
}) {
  const corpo = (
    <div className={cn("glass-card rounded-2xl px-4 py-4", alerta && "ring-1 ring-amber-400/25")}>
      <div className="flex items-center gap-1.5 text-[11.5px] text-text-tertiary">{icone} {rotulo}</div>
      <div className={cn("mt-1.5 font-display text-[26px] font-semibold tabular-nums", alerta ? "text-amber-300" : valor === 0 ? "text-text-tertiary" : "text-text-primary")}>
        {valor}
      </div>
    </div>
  );
  return href ? <Link href={href}>{corpo}</Link> : corpo;
}
