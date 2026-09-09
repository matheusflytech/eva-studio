"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, Aperture, MessageSquare, FileText } from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { Starburst } from "@/components/agent-studio/starburst";
import { buttonVariants } from "@/components/ui/button";
import { formatRelativeDate } from "@/lib/utils";
import { generateSeries } from "@/lib/mock-metrics";

export default function InicioPage() {
  const { session } = useAuth();
  const { agents, isLoaded, load } = useAgentsStore();

  React.useEffect(() => {
    if (!isLoaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  if (!isLoaded) return <div className="flex-1 p-8" />;

  const firstName = session?.name?.split(" ")[0] ?? "";
  const lastAgent = agents[0] ?? null;
  const totalDocs = agents.reduce((sum, a) => sum + a.knowledgeBase.length, 0);
  const activeAgents = agents.filter((a) => a.status === "active").length;
  const conversasHoje = generateSeries("overview-conversas", 14, 40, 12).at(-1) ?? 0;

  return (
    <div className="flex-1 p-8">
      <div className="glass-card relative mb-6 overflow-hidden rounded-3xl p-8">
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{ backgroundImage: "radial-gradient(ellipse at top left, rgba(245,247,250,0.12), transparent 60%)" }}
        />
        <Starburst className="pointer-events-none absolute -right-20 -top-20 h-[300px] w-[300px] opacity-[0.3]" />
        <div className="relative max-w-md">
          <h1 className="font-display text-2xl font-semibold text-text-primary">Bem-vindo, {firstName}</h1>
          <p className="mt-2 text-[14px] text-text-secondary">
            {agents.length === 0
              ? "Comece criando seu primeiro agente no Eva Studio."
              : `Você tem ${agents.length} ${agents.length === 1 ? "agente configurado" : "agentes configurados"}.`}
          </p>
          <Link
            href={agents.length === 0 ? "/agent-studio/new" : "/agent-studio"}
            className={buttonVariants({ variant: "solid", size: "md", className: "mt-6" })}
          >
            {agents.length === 0 ? "Criar agente" : "Ir para Eva Studio"} <ArrowRight size={15} />
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-2 text-text-tertiary">
            <Aperture size={14} />
            <span className="text-[12px]">Agentes ativos</span>
          </div>
          <p className="mt-2 font-display text-2xl font-semibold text-text-primary">{activeAgents}</p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-2 text-text-tertiary">
            <FileText size={14} />
            <span className="text-[12px]">Documentos na base</span>
          </div>
          <p className="mt-2 font-display text-2xl font-semibold text-text-primary">{totalDocs}</p>
        </div>
        <div className="glass-card rounded-2xl p-4">
          <div className="flex items-center gap-2 text-text-tertiary">
            <MessageSquare size={14} />
            <span className="text-[12px]">Conversas hoje (simulado)</span>
          </div>
          <p className="mt-2 font-display text-2xl font-semibold text-text-primary">{conversasHoje}</p>
        </div>
      </div>

      {lastAgent && (
        <div className="glass-card mt-4 flex items-center justify-between rounded-2xl p-4">
          <div>
            <p className="text-[12px] text-text-tertiary">Continue de onde parou</p>
            <p className="text-[14px] font-medium text-text-primary">{lastAgent.name}</p>
            <p className="text-[12px] text-text-tertiary">Atualizado {formatRelativeDate(lastAgent.updatedAt)}</p>
          </div>
          <Link href={`/agent-studio/${lastAgent.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            Abrir <ArrowRight size={13} />
          </Link>
        </div>
      )}
    </div>
  );
}
