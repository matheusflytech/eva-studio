"use client";

import { PainelDoAgente } from "@/components/playground/painel-do-agente";
import * as React from "react";
import Link from "@/components/contrato/link";
import { useParams, useSearchParams } from "@/lib/contrato/navegacao";
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

  if (!isLoaded) return <div className="flex-1" />;

  if (!agent) {
    return (
      <div className="flex flex-1 flex-col items-center gap-3 px-4 py-14 text-center">
        <p className="text-body text-text-secondary">Agente não encontrado.</p>
        <Link href="/agent-studio" className="text-small font-medium text-accent-fg hover:underline">
          Voltar para Agentes de IA
        </Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
      <AgentOverview agent={agent} />
      {/* Desktop largo: conteúdo à esquerda e a orbe com os dados do agente
          numa coluna à direita (a mesma do Playground), sem faixa vazia. */}
      <div className="grid w-full gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex min-w-0 max-w-4xl flex-col gap-4">

        {/* Abas em cápsula; a pergunta de cada uma fica no título (passar o mouse). */}
        <nav aria-label="Seções do agente" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <div className="inline-flex h-8 items-center rounded-full border border-border-subtle bg-raised p-0.5">
            {ABAS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => trocar(a.id)}
                aria-current={aba === a.id ? "page" : undefined}
                title={a.ajuda}
                className={cn(
                  "inline-flex h-full shrink-0 items-center whitespace-nowrap rounded-full px-3.5 text-small transition-colors",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                  aba === a.id ? "bg-inverse font-medium text-inverse-fg" : "text-text-secondary hover:text-text-primary"
                )}
              >
                {a.rotulo}
              </button>
            ))}
          </div>
        </nav>

        <div>
          {aba === "resumo" && <AgentResumo agent={agent} irParaAba={trocar} />}
          {/* O formulário fica sempre montado: o que se digita numa aba não some ao trocar. */}
          <div className={aba === "resumo" ? "hidden" : undefined}>
            <AgentForm agent={agent} aba={aba === "resumo" ? "comportamento" : aba} />
          </div>
        </div>
      </div>
      <PainelDoAgente agent={agent} falando={false} className="hidden self-start xl:sticky xl:top-2 xl:flex" />
      </div>
    </div>
  );
}

export default function EditAgentPage() {
  return (
    <React.Suspense fallback={<div className="flex-1" />}>
      <AgentePagina />
    </React.Suspense>
  );
}
