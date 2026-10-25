"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowLeft, Copy, Ellipsis, MessageSquare, Palette, PlayCircle, Workflow } from "lucide-react";
import { useRouter } from "@/lib/contrato/navegacao";
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
import { OrbeDoAgente } from "@/components/agent-studio/orbe-do-agente";
import { BotaoCorDaOrbe } from "@/components/agent-studio/cor-da-orbe";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { avisarNaIlha, pulsar } from "@/lib/fundo/eventos";
import type { Agent } from "@/lib/data/types";

// Barra do agente (v5): quem é, se está respondendo e as ações. O Builder é a
// ação principal (saiu das linhas da lista e mora aqui); testar é secundária e
// "Ver conversas" vai no "…". O interruptor pausa o agente de verdade (ele
// deixa de responder), por isso fica sempre à vista, com Desfazer na ilha.
export function AgentOverview({ agent }: { agent: Agent }) {
  const { toggleStatus, duplicate } = useAgentsStore();
  const router = useRouter();
  const [duplicando, setDuplicando] = React.useState(false);
  const isActive = agent.status === "active";

  // A cópia nasce pausada e sem canais: abre direto nela para conectar/ajustar.
  async function duplicar() {
    setDuplicando(true);
    try {
      const novoId = await duplicate(agent.id);
      avisarNaIlha({ titulo: "Agente duplicado", detalhe: `${agent.name} (cópia), pausado` });
      router.push(`/agent-studio/${novoId}`);
    } catch (erro) {
      avisarNaIlha({ titulo: "Não deu para duplicar", detalhe: erro instanceof Error ? erro.message : undefined });
    } finally {
      setDuplicando(false);
    }
  }

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
        {/* A orbe é o botão "Cor da orbe" (paleta + RGB num popover). */}
        <BotaoCorDaOrbe agenteId={agent.id} className="group/orbe relative -my-2 shrink-0">
          <OrbeDoAgente agenteId={agent.id} tamanho={56} />
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border border-border-subtle bg-overlay text-text-secondary shadow-overlay transition-colors group-hover/orbe:text-text-primary"
          >
            <Palette size={11} />
          </span>
        </BotaoCorDaOrbe>
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
              <IconButton aria-label="Mais ações do agente" variant="secondary">
                <Ellipsis />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem asChild>
                <Link href="/conversations">
                  <MessageSquare aria-hidden="true" /> Ver conversas
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem disabled={duplicando} onSelect={() => void duplicar()}>
                <Copy aria-hidden="true" /> Duplicar agente
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
