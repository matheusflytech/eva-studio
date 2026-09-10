"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { DonutChart } from "@/components/charts/donut-chart";
import { BarChart } from "@/components/charts/bar-chart";

const TOPICS = [
  { label: "Dúvidas sobre preço", value: 38 },
  { label: "Suporte técnico", value: 27 },
  { label: "Agendamento", value: 19 },
  { label: "Reclamações", value: 9 },
  { label: "Outros", value: 7 },
];

const SENTIMENT = [
  { label: "Positivo", value: 62 },
  { label: "Neutro", value: 28 },
  { label: "Negativo", value: 10 },
];

export default function InsightsPage() {
  const [peakHours, setPeakHours] = React.useState<{ label: string; value: number }[] | null>(null);

  React.useEffect(() => {
    fetch("/api/analytics/overview?days=30")
      .then((res) => res.json())
      .then((data) => setPeakHours(data.peakHours ?? []))
      .catch(() => setPeakHours([]));
  }, []);

  const hasRealActivity = (peakHours ?? []).some((p) => p.value > 0);

  return (
    <div className="flex-1 p-8">
      <div className="mb-6 flex items-center gap-2.5">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Insights</h1>
          <p className="mt-1 max-w-xl text-[13px] text-text-secondary">
            Leitura qualitativa das conversas dos seus agentes — temas, sentimento e horários de pico.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glass-card rounded-3xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="font-display text-[15px] font-semibold text-text-primary">Temas mais frequentes</h2>
            <Badge variant="neutral">Simulado</Badge>
          </div>
          <p className="mb-4 text-[11.5px] text-text-tertiary">
            Isso exigiria classificar o conteúdo das conversas com um LLM — o Eva Studio nunca chama IA sozinho (só
            delega pro webhook do seu próprio agente), então esse painel continua ilustrativo até virar um recurso
            de verdade, com seu próprio n8n classificando as mensagens.
          </p>
          <div className="flex flex-col gap-3">
            {TOPICS.map((t) => (
              <div key={t.label}>
                <div className="mb-1 flex items-center justify-between text-[12.5px]">
                  <span className="text-text-secondary">{t.label}</span>
                  <span className="text-text-tertiary">{t.value}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-surface-3">
                  <div className="h-1.5 rounded-full bg-white/40" style={{ width: `${t.value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card rounded-3xl p-5">
          <div className="mb-4 flex items-center gap-2">
            <h2 className="font-display text-[15px] font-semibold text-text-primary">Sentimento geral</h2>
            <Badge variant="neutral">Simulado</Badge>
          </div>
          <p className="mb-4 text-[11.5px] text-text-tertiary">Mesmo motivo do painel ao lado — precisaria de um LLM classificando.</p>
          <DonutChart segments={SENTIMENT} />
        </div>
      </div>

      <div className="glass-card mt-4 rounded-3xl p-5">
        <h2 className="mb-4 font-display text-[15px] font-semibold text-text-primary">Horários de pico</h2>
        <p className="mb-4 text-[11.5px] text-text-tertiary">
          Real — horário (fuso de São Paulo) em que os contatos mais escrevem, últimos 30 dias.
        </p>
        {peakHours === null ? (
          <p className="text-[13px] text-text-tertiary">Carregando...</p>
        ) : hasRealActivity ? (
          <BarChart data={peakHours} />
        ) : (
          <p className="text-[13px] text-text-tertiary">Sem mensagens registradas ainda nos últimos 30 dias.</p>
        )}
      </div>
    </div>
  );
}
