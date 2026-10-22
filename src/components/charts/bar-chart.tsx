import { cn } from "@/lib/utils";
import type { ChartPoint } from "./area-chart";

// Colunas verticais (ex.: mensagens por hora). Só cor de dado: as colunas em
// azul de destaque mais fraco e a maior em cheio. O valor de cada coluna fica
// no título (passar o mouse) e no rótulo acessível; embaixo, só alguns rótulos
// para caber no celular.
export function BarChart({ data, height = 160, formatarValor = (v) => v.toLocaleString("pt-BR") }: { data: ChartPoint[]; height?: number; formatarValor?: (v: number) => string }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const cadaRotulo = Math.max(1, Math.ceil(data.length / 8));
  const maior = data.findIndex((d) => d.value === max);
  return (
    <div role="img" aria-label={data.map((d) => `${d.label}: ${formatarValor(d.value)}`).join(", ")}>
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${d.label} · ${formatarValor(d.value)}`}>
            {i === maior && d.value > 0 && <span className="mb-1 text-center font-mono text-caption tabular-nums text-text-secondary">{formatarValor(d.value)}</span>}
            <div
              className={cn("w-full rounded-t-[5px] transition-[height] duration-500 motion-reduce:transition-none", i === maior && d.value > 0 ? "bg-accent-solid" : "bg-accent-solid/35")}
              style={{ height: `${Math.max((d.value / max) * 100, d.value > 0 ? 3 : 1)}%` }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex gap-[3px]" aria-hidden="true">
        {data.map((d, i) => (
          <span key={i} className="min-w-0 flex-1 overflow-visible whitespace-nowrap font-mono text-caption text-text-tertiary">
            {i % cadaRotulo === 0 ? d.label : ""}
          </span>
        ))}
      </div>
    </div>
  );
}
