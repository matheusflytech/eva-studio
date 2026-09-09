"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PlayCircle } from "lucide-react";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { EmptyState } from "@/components/ui/empty-state";
import { buttonVariants } from "@/components/ui/button";
import { AgentPicker } from "@/components/playground/agent-picker";
import { ChatPanel } from "@/components/playground/chat-panel";

export default function PlaygroundPage() {
  const { agents, isLoaded, load } = useAgentsStore();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("agent");
  const [activeId, setActiveId] = React.useState<string | null>(requestedId);

  React.useEffect(() => {
    if (!isLoaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  React.useEffect(() => {
    if (agents.length === 0) return;
    if (activeId && agents.some((a) => a.id === activeId)) return;
    setActiveId(agents[0].id);
  }, [activeId, agents]);

  if (!isLoaded) return <div className="flex-1 p-8" />;

  if (agents.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-10">
        <EmptyState
          className="max-w-lg"
          icon={<PlayCircle size={30} className="text-text-secondary" />}
          title="Playground"
          description="Crie um agente no Eva Studio para testar conversas simuladas aqui."
          action={
            <Link href="/agent-studio/new" className={buttonVariants({ variant: "solid", size: "md" })}>
              Criar agente
            </Link>
          }
        />
      </div>
    );
  }

  const activeAgent = agents.find((a) => a.id === activeId) ?? agents[0];

  return (
    <div className="flex flex-1 flex-col p-8">
      <div className="mb-5">
        <h1 className="font-display text-xl font-semibold text-text-primary">Playground</h1>
        <p className="mt-1 text-[13px] text-text-secondary">
          Teste seus agentes em uma conversa simulada, sem afetar dados reais.
        </p>
      </div>
      <div className="flex flex-1 gap-5">
        <AgentPicker agents={agents} activeId={activeAgent.id} onSelect={setActiveId} />
        <ChatPanel key={activeAgent.id} agent={activeAgent} />
      </div>
    </div>
  );
}
