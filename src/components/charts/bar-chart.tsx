import type { ChartPoint } from "./area-chart";

export function BarChart({ data, height = 160 }: { data: ChartPoint[]; height?: number }) {
  const max = Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="flex items-end gap-2" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
          <span className="text-[10.5px] text-text-tertiary">{d.value}</span>
          <div
            className="w-full rounded-t-md bg-white/15 transition-all"
            style={{ height: `${Math.max((d.value / max) * 100, 2)}%` }}
          />
          <span className="truncate text-[10.5px] text-text-tertiary">{d.label}</span>
        </div>
      ))}
    </div>
  );
}
