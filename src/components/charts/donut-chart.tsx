import { CORES_DE_SERIE } from "./cores";

export interface DonutSegment {
  label: string;
  value: number;
}

// Rosca: cada fatia numa cor de dado (azul de destaque primeiro, depois as
// categorias), com a porcentagem escrita na legenda — a cor é só reforço.
export function DonutChart({ segments, size = 140 }: { segments: DonutSegment[]; size?: number }) {
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  // Onde cada fatia começa: soma das anteriores (calculado antes de desenhar).
  const inicios = segments.map((_, i) => segments.slice(0, i).reduce((s, x) => s + (x.value / total) * circumference, 0));

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg
        viewBox="0 0 100 100"
        width={size}
        height={size}
        role="img"
        aria-label={segments.map((s) => `${s.label} ${Math.round((s.value / total) * 100)}%`).join(", ")}
        className="shrink-0"
      >
        <circle cx="50" cy="50" r={radius} fill="none" style={{ stroke: "var(--color-hover)" }} strokeWidth={12} />
        {segments.map((s, i) => {
          const fraction = s.value / total;
          const dash = fraction * circumference;
          return (
            <circle
              key={s.label}
              cx="50"
              cy="50"
              r={radius}
              fill="none"
              style={{ stroke: CORES_DE_SERIE[i % CORES_DE_SERIE.length].css }}
              strokeWidth={12}
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={-inicios[i]}
              transform="rotate(-90 50 50)"
            />
          );
        })}
      </svg>
      <ul className="flex min-w-0 flex-col gap-2">
        {segments.map((s, i) => (
          <li key={s.label} className="flex min-w-0 items-center gap-2 text-small">
            <span className={`size-2.5 shrink-0 rounded-full ${CORES_DE_SERIE[i % CORES_DE_SERIE.length].fundo}`} aria-hidden="true" />
            <span className="truncate text-text-secondary">{s.label}</span>
            <span className="font-mono text-caption tabular-nums text-text-tertiary">{Math.round((s.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
