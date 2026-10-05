"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { AgentForm, type AbaDoAgente } from "@/components/agent-studio/agent-form";
import { AgentOverview } from "@/components/agent-studio/agent-overview";
import { AgentResumo } from "@/components/agent-studio/agent-resumo";
import { cn } from "@/lib/utils";

const ABAS: { id: AbaDoAgente; rotulo: string; ajuda: string }[] = [
  { id: "resumo", rotulo: "Resumo", ajuda: "Ele está funcionando?" },
  { id: "comportamento", rotulo: "Comportamento", ajuda: "O que ele sabe e como fala" },
  { id: "canais", rotulo: "Canais", ajuda: "Onde ele atende" },
  { id: "avancado", rotulo: "Avançado", ajuda: "n8n, variáveis e exclusão" },
];

function AgentePagina() {
  const { agentId } = useParams<{ agentId: string }>();
  const params = useSearchParams();
  const { agents, isLoaded, load } = useAgentsStore();

  const inicial = ABAS.find((a) => a.id === params.get("aba"))?.id ?? "resumo";
  const [aba, setAba] = React.useState<AbaDoAgente>(inicial);

  React.useEffect(() => {
    if (!isLoaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  function trocar(a: AbaDoAgente) {
    setAba(a);
    // Guarda a aba na URL: dá pra mandar o link "aba de canais" a alguém e o F5 não volta pro resumo.
    const url = new URL(window.location.href);
    url.searchParams.set("aba", a);
    window.history.replaceState(null, "", url.toString());
  }

  const agent = agents.find((a) => a.id === agentId);

  if (!isLoaded) return <div className="flex-1 p-8" />;

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
    <div className="flex-1 p-4 sm:p-8">
      <div className="mx-auto max-w-3xl">
        <Link
          href="/agent-studio"
          className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-text-secondary hover:text-text-primary"
        >
          <ArrowLeft size={15} /> Agentes
        </Link>

        <AgentOverview agent={agent} />

        <nav className="mt-6 flex gap-1 overflow-x-auto rounded-2xl bg-surface-2 p-1" aria-label="Seções do agente">
          {ABAS.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => trocar(a.id)}
              aria-current={aba === a.id ? "page" : undefined}
              className={cn(
                "shrink-0 rounded-xl px-4 py-2 text-left transition-colors",
                aba === a.id ? "bg-surface-3 text-text-primary" : "text-text-secondary hover:text-text-primary"
              )}
            >
              <span className="block text-[13px] font-medium">{a.rotulo}</span>
              <span className="hidden text-[11px] text-text-tertiary sm:block">{a.ajuda}</span>
            </button>
          ))}
        </nav>

        <div className="mt-5">
          {aba === "resumo" && <AgentResumo agent={agent} irParaAba={trocar} />}
          {/* O formulário fica sempre montado: o que se digita numa aba não some ao trocar. */}
          <div className={aba === "resumo" ? "hidden" : undefined}>
            <AgentForm agent={agent} aba={aba === "resumo" ? "comportamento" : aba} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EditAgentPage() {
  return (
    <React.Suspense fallback={<div className="flex-1 p-8" />}>
      <AgentePagina />
    </React.Suspense>
  );
}
