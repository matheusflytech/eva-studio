"use client";

import * as React from "react";
import { Aperture, FileText, MessageSquare, Percent } from "lucide-react";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { AreaChart } from "@/components/charts/area-chart";
import { BarChart } from "@/components/charts/bar-chart";
import { generateSeries, lastNDaysLabels } from "@/lib/mock-metrics";

const RANGES = [
  { label: "7 dias", days: 7 },
  { label: "14 dias", days: 14 },
  { label: "30 dias", days: 30 },
];

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
  const [selectedVariableId, setSelectedVariableId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isLoaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  React.useEffect(() => {
    if (!selectedAgentId && agents.length > 0) setSelectedAgentId(agents[0].id);
  }, [selectedAgentId, agents]);

  const activeAgents = agents.filter((a) => a.status === "active").length;
  const totalDocs = agents.reduce((sum, a) => sum + a.knowledgeBase.length, 0);
  const selectedAgent = agents.find((a) => a.id === selectedAgentId) ?? null;

  React.useEffect(() => {
    if (selectedAgent && selectedAgent.variables.length > 0) {
      setSelectedVariableId(selectedAgent.variables[0].id);
    } else {
      setSelectedVariableId(null);
    }
  }, [selectedAgent]);

  const overviewSeries = React.useMemo(() => {
    const labels = lastNDaysLabels(rangeDays);
    const values = generateSeries("overview-conversas", rangeDays, 40, 12);
    return labels.map((label, i) => ({ label, value: values[i] }));
  }, [rangeDays]);

  const mockConversas = React.useMemo(() => overviewSeries.reduce((s, p) => s + p.value, 0), [overviewSeries]);

  const selectedVariable = selectedAgent?.variables.find((v) => v.id === selectedVariableId) ?? null;
  const variableSeries = React.useMemo(() => {
    if (!selectedAgent || !selectedVariable) return [];
    const labels = lastNDaysLabels(7);
    const values = generateSeries(`${selectedAgent.id}-${selectedVariable.id}`, 7, 20, 8);
    return labels.map((label, i) => ({ label, value: values[i] }));
  }, [selectedAgent, selectedVariable]);

  if (!isLoaded) return <div className="flex-1 p-8" />;

  return (
    <div className="flex-1 p-8">
      <div className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="font-display text-xl font-semibold text-text-primary">Dashboard</h1>
          <Badge variant="neutral">Dados simulados</Badge>
        </div>
        <p className="mt-1 text-[13px] text-text-secondary">Visão macro da operação e micro por agente.</p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard icon={Aperture} label="Agentes ativos" value={String(activeAgents)} />
        <StatCard icon={MessageSquare} label="Conversas (simulado)" value={mockConversas.toLocaleString("pt-BR")} />
        <StatCard icon={Percent} label="Taxa de resposta" value="94%" />
        <StatCard icon={FileText} label="Documentos na base" value={String(totalDocs)} />
      </div>

      <div className="glass-card mb-5 rounded-3xl p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-[15px] font-semibold text-text-primary">Visão geral</h2>
            <p className="text-[12.5px] text-text-secondary">Conversas simuladas ao longo do tempo, todos os agentes.</p>
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
        <AreaChart data={overviewSeries} />
      </div>

      <div className="glass-card rounded-3xl p-5">
        <div className="mb-4">
          <h2 className="font-display text-[15px] font-semibold text-text-primary">Visão por agente</h2>
          <p className="text-[12.5px] text-text-secondary">
            Selecione um agente e uma das variáveis configuradas nele em Eva Studio.
          </p>
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

            {selectedAgent && selectedAgent.variables.length > 0 ? (
              <>
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {selectedAgent.variables.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      onClick={() => setSelectedVariableId(v.id)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-[12px] font-medium transition-colors",
                        selectedVariableId === v.id
                          ? "border-border-strong bg-surface-3 text-text-primary"
                          : "border-border-default bg-surface-2 text-text-secondary hover:border-border-strong"
                      )}
                    >
                      {v.name}
                      {v.unit && <span className="text-text-tertiary"> · {v.unit}</span>}
                    </button>
                  ))}
                </div>
                <BarChart data={variableSeries} />
              </>
            ) : (
              <p className="text-[13px] text-text-tertiary">
                Esse agente ainda não tem variáveis configuradas — adicione em Eva Studio &gt; Variáveis.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
