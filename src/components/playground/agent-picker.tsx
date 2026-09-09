"use client";

import { Aperture } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Agent } from "@/lib/data/types";

export function AgentPicker({
  agents,
  activeId,
  onSelect,
}: {
  agents: Agent[];
  activeId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="glass-card flex w-[260px] shrink-0 flex-col gap-1.5 rounded-3xl p-3">
      <p className="mb-1 px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
        Agentes
      </p>
      {agents.map((agent) => {
        const isActive = agent.id === activeId;
        return (
          <button
            key={agent.id}
            onClick={() => onSelect(agent.id)}
            className={cn(
              "flex items-start gap-3 rounded-2xl border p-3 text-left transition-colors",
              isActive ? "border-border-strong bg-surface-2" : "border-transparent hover:bg-surface-2/60"
            )}
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-text-secondary">
              <Aperture size={16} />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-[13.5px] font-medium text-text-primary">{agent.name}</span>
              <span className="mt-0.5 line-clamp-2 block text-[12px] text-text-tertiary">
                {agent.description || "Sem descrição."}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
