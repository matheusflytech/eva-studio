"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { useSearchParams } from "@/lib/contrato/navegacao";
import { Plus, RotateCcw } from "lucide-react";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { Button, buttonVariants } from "@/components/ui/button";
import { AgentPicker } from "@/components/playground/agent-picker";
import { ChatPanel } from "@/components/playground/chat-panel";

// ---------------------------------------------------------------------------
// Playground (v5): a conversa ocupa a tela, numa coluna central. Só duas
// ações na barra: trocar de agente e Reiniciar.
// ---------------------------------------------------------------------------

export default function PlaygroundPage() {
  const { agents, isLoaded, load } = useAgentsStore();
  const searchParams = useSearchParams();
  const requestedId = searchParams.get("agent");
  const [activeId, setActiveId] = React.useState<string | null>(requestedId);
  // Reiniciar = montar a conversa de novo: volta a saudação e nasce outro
  // contato de teste, igual ao antigo botão dentro do painel.
  const [rodada, setRodada] = React.useState(0);

  React.useEffect(() => {
    if (!isLoaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  React.useEffect(() => {
    if (agents.length === 0) return;
    if (activeId && agents.some((a) => a.id === activeId)) return;
    setActiveId(agents[0].id);
  }, [activeId, agents]);

  if (!isLoaded) return <div className="flex-1" />;

  const barra = (extra?: React.ReactNode) => (
    <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2">
      <h1 className="text-heading font-semibold tracking-tight text-text-primary">Playground</h1>
      <span className="font-mono text-caption text-text-tertiary">teste, nada é salvo</span>
      {extra && <div className="ml-auto flex min-w-0 items-center gap-2">{extra}</div>}
    </div>
  );

  if (agents.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
        {barra()}
        <div className="flex flex-col items-center gap-3 rounded-[18px] border border-border-subtle bg-panel px-6 py-14 text-center">
          <p className="text-body text-text-secondary">Crie um agente para conversar com ele aqui.</p>
          <Link href="/agent-studio/new" className={buttonVariants({ variant: "primary", size: "md" })}>
            <Plus size={15} aria-hidden="true" /> Novo agente
          </Link>
        </div>
      </div>
    );
  }

  const activeAgent = agents.find((a) => a.id === activeId) ?? agents[0];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pt-1 lg:px-6">
      {barra(
        <>
          <AgentPicker agents={agents} activeId={activeAgent.id} onSelect={setActiveId} />
          <Button variant="secondary" onClick={() => setRodada((r) => r + 1)}>
            <RotateCcw size={14} aria-hidden="true" /> Reiniciar
          </Button>
        </>
      )}
      <ChatPanel key={`${activeAgent.id}-${rodada}`} agent={activeAgent} />
    </div>
  );
}
