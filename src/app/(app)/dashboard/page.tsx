"use client";

import * as React from "react";
import { Aperture, FileText, MessageSquare, Percent } from "lucide-react";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { cn } from "@/lib/utils";
import { AreaChart } from "@/components/charts/area-chart";
import { BarChart } from "@/components/charts/bar-chart";

const RANGES = [
  { label: "7 dias", days: 7 },
  { label: "14 dias", days: 14 },
  { label: "30 dias", days: 30 },
];

interface Overview {
  series: { label: string; contacts: number; replies: number }[];
  totalConversations: number;
  totalContactMessages: number;
  responseRate: number;
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ size?: number }>; label: string; value: string }) {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="flex items-center gap-2 text-text-tertiary">
        <Icon size={14} />
        <span className="text-[12px]">{label}</span>
      </div>
      <p className="mt-2 font-display text-2xl font-semibold text-text-primary">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const { agents, isLoaded, load } = useAgentsStore();
  const [rangeDays, setRangeDays] = React.useState(14);
  const [selectedAgentId, setSelectedAgentId] = React.useState<string | null>(null);
  const [overview, setOverview] = React.useState<Overview | null>(null);
  const [agentOverview, setAgentOverview] = React.useState<Overview | null>(null);

  React.useEffect(() => {
    if (!isLoaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  React.useEffect(() => {
    if (!selectedAgentId && agents.length > 0) setSelectedAgentId(agents[0].id);
  }, [selectedAgentId, agents]);

  const activeAgents = agents.filter((a) => a.status === "active").length;
  const totalDocs = agents.reduce((sum, a) => sum + a.knowledgeBase.length, 0);

  React.useEffect(() => {
    fetch(`/api/analytics/overview?days=${rangeDays}`)
      .then((res) => res.json())
      .then(setOverview)
      .catch(() => setOverview(null));
  }, [rangeDays]);

  React.useEffect(() => {
    if (!selectedAgentId) {
      setAgentOverview(null);
      return;
    }
    fetch(`/api/analytics/overview?days=7&agentId=${selectedAgentId}`)
      .then((res) => res.json())
      .then(setAgentOverview)
      .catch(() => setAgentOverview(null));
  }, [selectedAgentId]);

  const overviewSeries = overview?.series.map((p) => ({ label: p.label, value: p.contacts })) ?? [];
  const agentSeries = agentOverview?.series.map((p) => ({ label: p.label, value: p.contacts + p.replies })) ?? [];

  if (!isLoaded) return <div className="flex-1 p-8" />;

  return (
    <div className="flex-1 p-8">
      <div className="mb-6">
        <h1 className="font-display text-xl font-semibold text-text-primary">Dashboard</h1>
        <p className="mt-1 text-[13px] text-text-secondary">Visão macro da operação e micro por agente — dados reais.</p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Aperture} label="Agentes ativos" value={String(activeAgents)} />
        <StatCard icon={MessageSquare} label="Conversas" value={(overview?.totalConversations ?? 0).toLocaleString("pt-BR")} />
        <StatCard icon={Percent} label="Taxa de resposta" value={overview ? `${overview.responseRate}%` : "—"} />
        <StatCard icon={FileText} label="Documentos na base" value={String(totalDocs)} />
      </div>

      <div className="glass-card mb-5 rounded-3xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-text-primary">Visão geral</h2>
            <p className="text-[12.5px] text-text-secondary">Mensagens recebidas dos contatos por dia, todos os agentes.</p>
          </div>
          <div className="flex gap-1.5">
            {RANGES.map((r) => (
              <button
                key={r.days}
                type="button"
                onClick={() => setRangeDays(r.days)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                  rangeDays === r.days
                    ? "border-ice-border bg-ice-soft text-ice"
                    : "border-border-default bg-surface-2 text-text-secondary hover:border-border-strong"
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {overviewSeries.length > 0 ? (
          <AreaChart data={overviewSeries} />
        ) : (
          <p className="text-[13px] text-text-tertiary">Sem mensagens registradas nesse período ainda.</p>
        )}
      </div>

      <div className="glass-card rounded-3xl p-5">
        <div className="mb-4">
          <h2 className="font-display text-[15px] font-semibold text-text-primary">Visão por agente</h2>
          <p className="text-[12.5px] text-text-secondary">Total de mensagens (contato + resposta) por dia, últimos 7 dias.</p>
        </div>

        {agents.length === 0 ? (
          <p className="text-[13px] text-text-tertiary">Crie um agente no Eva Studio para ver dados aqui.</p>
        ) : (
          <>
            <div className="mb-4 flex flex-wrap gap-1.5">
              {agents.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedAgentId(a.id)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                    selectedAgentId === a.id
                      ? "border-ice-border bg-ice-soft text-ice"
                      : "border-border-default bg-surface-2 text-text-secondary hover:border-border-strong"
                  )}
                >
                  {a.name}
                </button>
              ))}
            </div>

            {agentSeries.some((p) => p.value > 0) ? (
              <BarChart data={agentSeries} />
            ) : (
              <p className="text-[13px] text-text-tertiary">
                Esse agente ainda não trocou mensagens — converse com ele no Playground ou conecte um canal.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
