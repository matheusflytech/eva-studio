"use client";

import { Aperture } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useAgentsStore } from "@/lib/stores/agents-store";
import type { Agent } from "@/lib/data/types";

// Cabeçalho do agente: quem é e se está respondendo. O interruptor pausa o
// agente de verdade (ele deixa de responder), por isso fica sempre à vista.
export function AgentOverview({ agent }: { agent: Agent }) {
  const { toggleStatus } = useAgentsStore();
  const isActive = agent.status === "active";

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="flex min-w-0 items-center gap-3.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-3 text-text-secondary">
          <Aperture size={22} />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-display text-[20px] font-semibold text-text-primary">{agent.name}</h1>
            <Badge variant={isActive ? "success" : "neutral"}>{isActive ? "Respondendo" : "Pausado"}</Badge>
          </div>
          <p className="mt-0.5 line-clamp-1 text-[13px] text-text-secondary">{agent.description || "Sem descrição."}</p>
        </div>
      </div>

      <label className="flex shrink-0 items-center gap-2 pt-1.5" title="Pausar faz o agente parar de responder">
        <span className="hidden text-[12px] text-text-tertiary sm:inline">{isActive ? "Respondendo" : "Pausado"}</span>
        <Switch checked={isActive} onCheckedChange={() => toggleStatus(agent.id)} />
      </label>
    </div>
  );
}
