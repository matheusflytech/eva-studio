"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowLeft, Ellipsis, MessageSquare, PlayCircle, Workflow } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { buttonVariants } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { QuadradoDoAgente } from "@/components/inbox/avatar";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { avisarNaIlha, pulsar } from "@/lib/fundo/eventos";
import type { Agent } from "@/lib/data/types";

// Barra do agente (v5): quem é, se está respondendo e as ações. O Builder é a
// ação principal (saiu das linhas da lista e mora aqui); testar é secundária e
// "Ver conversas" vai no "…". O interruptor pausa o agente de verdade (ele
// deixa de responder), por isso fica sempre à vista, com Desfazer na ilha.
export function AgentOverview({ agent }: { agent: Agent }) {
  const { toggleStatus } = useAgentsStore();
  const isActive = agent.status === "active";

  async function alternar(el: HTMLElement) {
    pulsar(el, 1.2);
    await toggleStatus(agent.id);
    avisarNaIlha({
      titulo: isActive ? "Agente pausado" : "Agente respondendo",
      detalhe: agent.name,
      avatar: agent.name.charAt(0).toUpperCase(),
      acao: { rotulo: "Desfazer", aoClicar: () => void toggleStatus(agent.id) },
    });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          href="/agent-studio"
          aria-label="Voltar para Agentes de IA"
          className={buttonVariants({ variant: "ghost", size: "icon", className: "-ml-1.5 shrink-0" })}
        >
          <ArrowLeft aria-hidden="true" />
        </Link>
        <QuadradoDoAgente id={agent.id} nome={agent.name} className="h-8 w-8 rounded-[9px] text-small" />
        <h1 className="min-w-0 truncate text-heading font-semibold tracking-tight text-text-primary">{agent.name}</h1>
        <Badge variant={isActive ? "success" : "neutral"} dot={isActive}>
          {isActive ? "Respondendo" : "Pausado"}
        </Badge>

        <div className="ml-auto flex items-center gap-2">
          <label className="mr-1 flex items-center gap-2" title="Pausar faz o agente parar de responder">
            <span className="hidden font-mono text-caption text-text-tertiary sm:inline">{isActive ? "no ar" : "pausado"}</span>
            <Switch
              checked={isActive}
              aria-label={isActive ? "Pausar o agente" : "Pôr o agente para responder"}
              // onClick (e não onCheckedChange) para saber de onde sai a onda do fundo.
              onClick={(e) => void alternar(e.currentTarget)}
            />
          </label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label="Mais: ver conversas" variant="secondary">
                <Ellipsis />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link href="/conversas">
                  <MessageSquare aria-hidden="true" /> Ver conversas
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Link href={`/playground?agent=${agent.id}`} className={buttonVariants({ variant: "secondary", size: "md" })}>
            <PlayCircle size={14} aria-hidden="true" /> Testar
          </Link>
          <Link href={`/agent-studio/${agent.id}/builder`} className={buttonVariants({ variant: "primary", size: "md" })}>
            <Workflow size={14} aria-hidden="true" /> Abrir builder
          </Link>
        </div>
      </div>
      {agent.description && (
        <p className="line-clamp-1 pl-10 text-small text-text-secondary">{agent.description}</p>
      )}
    </div>
  );
}
