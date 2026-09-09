"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { AgentForm } from "@/components/agent-studio/agent-form";
import { AgentOverview } from "@/components/agent-studio/agent-overview";

export default function EditAgentPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const { agents, isLoaded, load } = useAgentsStore();

  React.useEffect(() => {
    if (!isLoaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  const agent = agents.find((a) => a.id === agentId);

  if (!isLoaded) {
    return <div className="flex-1 p-8" />;
  }

  if (!agent) {
    return (
      <div className="flex-1 p-8 text-center">
        <p className="text-[15px] text-text-secondary">Agente não encontrado.</p>
        <Link href="/agent-studio" className="mt-3 inline-block text-[13px] font-medium text-accent-400">
          Voltar para o Eva Studio
        </Link>
      </div>
    );
  }

  return (
    <div className="flex-1 p-8">
      <Link
        href="/agent-studio"
        className="mb-6 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={15} /> Eva Studio
      </Link>
      <AgentOverview agent={agent} />
      <AgentForm agent={agent} />
    </div>
  );
}
