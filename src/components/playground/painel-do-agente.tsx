"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowUpRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { OrbeDoAgente } from "@/components/agent-studio/orbe-do-agente";
import { PaletaDaOrbe } from "@/components/agent-studio/cor-da-orbe";
import { cn } from "@/lib/utils";
import type { Agent } from "@/lib/data/types";

// ---------------------------------------------------------------------------
// Coluna do agente no Playground (desktop largo): a orbe grande, que fala
// enquanto a resposta chega, quem é o agente e a cor da orbe. Só mostra o que o
// próprio agente já traz (nada de chamada nova).
// ---------------------------------------------------------------------------

function contagem(n: number, um: string, varios: string, nenhum: string) {
  return n === 0 ? nenhum : `${n} ${n === 1 ? um : varios}`;
}

export function PainelDoAgente({
  agent,
  falando,
  className,
}: {
  agent: Agent;
  falando: boolean;
  className?: string;
}) {
  const ativo = agent.status === "active";
  const linhas: [string, string][] = [
    ["Canal", agent.primaryChannel || "—"],
    ["Idioma", agent.language],
    ["Tom", agent.tone || "—"],
    ["Base de conhecimento", contagem(agent.knowledgeBase.length, "documento", "documentos", "vazia")],
    ["Habilidades", contagem(agent.skills.length, "habilidade", "habilidades", "nenhuma")],
    ["Ferramentas", contagem(agent.tools.length, "ferramenta", "ferramentas", "nenhuma")],
  ];

  return (
    <aside
      aria-label={`Sobre ${agent.name}`}
      className={cn(
        "mb-6 mt-4 w-[340px] shrink-0 flex-col gap-4 overflow-y-auto rounded-[18px] border border-border-subtle bg-panel p-5",
        className
      )}
    >
      <div className="flex flex-col items-center gap-3 pt-2 text-center">
        <OrbeDoAgente agenteId={agent.id} tamanho={144} falando={falando} />
        <div className="flex min-w-0 max-w-full flex-col items-center gap-1.5">
          <h2 className="max-w-full truncate text-title font-semibold tracking-tight text-text-primary">{agent.name}</h2>
          <Badge variant={ativo ? "success" : "neutral"} dot={ativo}>
            {falando ? "Respondendo agora" : ativo ? "Respondendo" : "Pausado"}
          </Badge>
        </div>
        <p className="line-clamp-4 text-small text-text-secondary">{agent.description || "Sem descrição."}</p>
      </div>

      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 border-t border-border-subtle pt-4 text-small">
        {linhas.map(([rotulo, valor]) => (
          <React.Fragment key={rotulo}>
            <dt className="text-text-tertiary">{rotulo}</dt>
            <dd className="truncate text-right text-text-primary">{valor}</dd>
          </React.Fragment>
        ))}
      </dl>

      <section aria-label="Cor da orbe" className="flex flex-col gap-3 border-t border-border-subtle pt-4">
        <span className="text-small font-medium text-text-primary">Cor da orbe</span>
        <PaletaDaOrbe agenteId={agent.id} />
      </section>

      <Link
        href={`/agent-studio/${agent.id}`}
        className="mt-auto inline-flex items-center gap-1 self-start text-small text-text-secondary hover:text-text-primary hover:underline"
      >
        Abrir o agente <ArrowUpRight size={13} aria-hidden="true" />
      </Link>
    </aside>
  );
}
