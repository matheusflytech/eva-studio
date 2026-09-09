export interface DonutSegment {
  label: string;
  value: number;
}

const SHADES = ["rgba(255,255,255,0.85)", "rgba(255,255,255,0.45)", "rgba(255,255,255,0.2)", "rgba(255,255,255,0.1)"];

export function DonutChart({ segments, size = 140 }: { segments: DonutSegment[]; size?: number }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-5">
      <svg viewBox="0 0 100 100" width={size} height={size}>
        <circle cx="50" cy="50" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={14} />
        {segments.map((s, i) => {
          const fraction = s.value / total;
          const dash = fraction * circumference;
          const el = (
            <circle
              key={s.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              stroke={SHADES[i % SHADES.length]}
              strokeWidth={14}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-offset}
              transform="rotate(-90 50 50)"
            />
          );
          offset += dash;
          return el;
        })}
      </svg>
      <div className="flex flex-col gap-2">
        {segments.map((s, i) => (
          <div key={s.label} className="flex items-center gap-2 text-[12.5px]">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ background: SHADES[i % SHADES.length] }}
            />
            <span className="text-text-secondary">{s.label}</span>
            <span className="text-text-tertiary">{Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
