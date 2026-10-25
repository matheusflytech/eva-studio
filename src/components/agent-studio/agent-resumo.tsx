"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { CheckCircle2, ChevronRight, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
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
      aba: "behavior",
    },
    {
      feito: temCanal,
      titulo: "Canal conectado",
      detalhe: temCanal
        ? ov!.canais.map((c) => c.label + (c.detalhe ? ` (${c.detalhe})` : "")).join(", ")
        : "Conecte o WhatsApp, Instagram ou outro canal para os clientes alcançarem o agente.",
      aba: "channels",
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
      aba: "behavior",
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
    <div className="flex flex-col gap-4">
      <section className="rounded-[18px] border border-border-subtle bg-panel px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-caption text-text-tertiary">o que este agente faz</p>
            <p className="mt-1 max-w-[640px] text-body text-text-primary">
              {carregado ? descreverFuncionamento(agent, ov) || "Sem dados ainda." : "Carregando…"}
            </p>
          </div>
          <Badge variant={pausado ? "neutral" : faltam > 0 ? "warning" : "success"} dot={!pausado && faltam === 0}>
            {pausado ? "Pausado: não responde" : faltam > 0 ? `Falta${faltam > 1 ? "m" : ""} ${faltam} passo${faltam > 1 ? "s" : ""}` : "No ar e completo"}
          </Badge>
        </div>
      </section>

      <section className="rounded-[18px] border border-border-subtle bg-panel px-5 py-3">
        <h2 className="flex h-9 items-center text-body font-medium text-text-primary">Para funcionar de verdade</h2>
        {/* Tela bem larga: duas colunas de passos, para a lista não virar uma faixa comprida. */}
        <ul className="grid grid-cols-1 gap-x-8 2xl:grid-cols-2">
          {passos.map((p) => {
            const corpo = (
              <div className="flex min-h-[52px] items-center gap-3 py-2.5">
                {p.feito ? (
                  <CheckCircle2 size={17} aria-hidden="true" className="shrink-0 text-success" />
                ) : (
                  <Circle size={17} aria-hidden="true" className="shrink-0 text-text-tertiary" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={cn("text-small font-medium", p.feito ? "text-text-secondary" : "text-text-primary")}>{p.titulo}</span>
                    {p.opcional && <span className="font-mono text-caption text-text-tertiary">opcional</span>}
                  </div>
                  <p className="mt-0.5 text-caption text-text-tertiary">{p.detalhe}</p>
                </div>
                {!p.feito && <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-text-tertiary" />}
              </div>
            );
            const classe = "-mx-2 block rounded-[12px] border-t border-border-subtle px-2 transition-colors first:border-t-0 hover:bg-raised";
            if (p.href) {
              return (
                <li key={p.titulo} className="group">
                  <Link href={p.href} className={classe}>{corpo}</Link>
                </li>
              );
            }
            return (
              <li key={p.titulo}>
                <button type="button" onClick={() => p.aba && irParaAba(p.aba)} className={cn(classe, "w-[calc(100%+1rem)] text-left")}>
                  {corpo}
                </button>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Três números, sem ícone: conversas, quem espera e execuções (com os erros juntos). */}
      {ov && (
        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Numero rotulo="Conversas nos 7 dias" valor={ov.conversas7d} />
          <Numero
            rotulo="Esperando atendente"
            valor={ov.aguardandoHumano}
            alerta={ov.aguardandoHumano > 0}
            href="/conversations"
          />
          <Numero
            rotulo="Execuções nas 24h"
            valor={ov.execucoes24h}
            sub={ov.erros24h > 0 ? `${ov.erros24h} com erro` : undefined}
            href={ov.erros24h > 0 ? `/agent-studio/${agent.id}/builder` : undefined}
          />
        </section>
      )}

      <p className="font-mono text-caption text-text-tertiary">
        atualizado {formatRelativeDate(agent.updatedAt)}
        {ov?.ultimaAtividadeAt ? ` · última conversa ${formatRelativeDate(ov.ultimaAtividadeAt)}` : ""}
      </p>
    </div>
  );
}

function Numero({
  rotulo, valor, sub, alerta, href,
}: {
  rotulo: string;
  valor: number;
  sub?: string;
  alerta?: boolean;
  href?: string;
}) {
  const corpo = (
    <div className={cn("flex h-full flex-col gap-1 rounded-[18px] border border-border-subtle bg-panel px-5 py-4", href && "transition-colors hover:bg-raised")}>
      <span className="text-small text-text-secondary">{rotulo}</span>
      <span className="flex items-baseline justify-between gap-2">
        <b className={cn("text-display font-medium tabular-nums tracking-tight", alerta ? "text-danger" : valor === 0 ? "text-text-tertiary" : "text-text-primary")}>
          {valor}
        </b>
        {sub && <span className="font-mono text-caption text-danger">{sub}</span>}
      </span>
    </div>
  );
  return href ? <Link href={href}>{corpo}</Link> : corpo;
}
