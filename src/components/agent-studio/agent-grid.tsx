import Link from "next/link";
import { Plus } from "lucide-react";
import { AgentCard } from "./agent-card";
import { buttonVariants } from "@/components/ui/button";
import type { Agent } from "@/lib/data/types";

export function AgentGrid({ agents }: { agents: Agent[] }) {
  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Eva Studio</h1>
          <p className="mt-1 text-[13px] text-text-secondary">
            {agents.length} {agents.length === 1 ? "agente configurado" : "agentes configurados"}
          </p>
        </div>
        <Link href="/agent-studio/new" className={buttonVariants({ variant: "solid", size: "md" })}>
          <Plus size={16} /> Novo agente
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {agents.map((agent) => (
          <AgentCard key={agent.id} agent={agent} />
        ))}
      </div>
    </div>
  );
}
