"use client";

import Link from "next/link";
import { Aperture, PlayCircle, MessageSquare, Workflow, FileText } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { buttonVariants } from "@/components/ui/button";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { formatRelativeDate } from "@/lib/utils";
import type { Agent } from "@/lib/data/types";

export function AgentOverview({ agent }: { agent: Agent }) {
  const { toggleStatus } = useAgentsStore();
  const isActive = agent.status === "active";

  return (
    <div className="glass-card mx-auto mb-6 max-w-2xl rounded-3xl p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-surface-3 text-text-secondary">
            <Aperture size={22} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-display text-[18px] font-semibold text-text-primary">
                {agent.name}
              </h1>
              <Badge variant={isActive ? "success" : "neutral"}>{isActive ? "Ativo" : "Pausado"}</Badge>
            </div>
            <p className="mt-0.5 line-clamp-1 text-[13px] text-text-secondary">
              {agent.description || "Sem descrição."}
            </p>
          </div>
        </div>

        <label className="flex shrink-0 items-center gap-2 pt-1">
          <span className="text-[12px] text-text-tertiary">{isActive ? "Ativo" : "Pausado"}</span>
          <Switch checked={isActive} onCheckedChange={() => toggleStatus(agent.id)} />
        </label>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border-subtle pt-4">
        <Link href={`/playground?agent=${agent.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          <PlayCircle size={14} /> Testar no Playground
        </Link>
        <Link href="/conversas" className={buttonVariants({ variant: "secondary", size: "sm" })}>
          <MessageSquare size={14} /> Ver conversas
        </Link>
        <Link href={`/agent-studio/${agent.id}/builder`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
          <Workflow size={14} /> Abrir builder de conversa
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] text-text-tertiary">
        <span className="flex items-center gap-1">
          <FileText size={13} /> {agent.knowledgeBase.length} documentos
        </span>
        <span>{agent.skills.length} habilidades</span>
        <span>{agent.webhook.outboundUrl ? "Webhook conectado" : "Webhook não configurado"}</span>
        <span>Atualizado {formatRelativeDate(agent.updatedAt)}</span>
      </div>
    </div>
  );
}
