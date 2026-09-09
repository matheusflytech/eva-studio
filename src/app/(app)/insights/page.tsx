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

const PEAK_HOURS = ["8h", "10h", "12h", "14h", "16h", "18h", "20h"].map((label, i) => ({
  label,
  value: [12, 28, 40, 55, 62, 38, 20][i],
}));

export default function InsightsPage() {
  return (
    <div className="flex-1 p-8">
      <div className="mb-6 flex items-center gap-2.5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-xl font-semibold text-text-primary">Insights</h1>
            <Badge variant="neutral">Dados simulados</Badge>
          </div>
          <p className="mt-1 max-w-xl text-[13px] text-text-secondary">
            Leitura qualitativa das conversas dos seus agentes — temas, sentimento e horários de pico.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="glass-card rounded-3xl p-5">
          <h2 className="mb-4 font-display text-[15px] font-semibold text-text-primary">Temas mais frequentes</h2>
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
          <h2 className="mb-4 font-display text-[15px] font-semibold text-text-primary">Sentimento geral</h2>
          <DonutChart segments={SENTIMENT} />
        </div>
      </div>

      <div className="glass-card mt-4 rounded-3xl p-5">
        <h2 className="mb-4 font-display text-[15px] font-semibold text-text-primary">Horários de pico</h2>
        <BarChart data={PEAK_HOURS} />
      </div>
    </div>
  );
}
