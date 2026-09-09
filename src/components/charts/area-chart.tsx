export interface ChartPoint {
  label: string;
  value: number;
}

export function AreaChart({ data, height = 180 }: { data: ChartPoint[]; height?: number }) {
  const width = 100;
  const max = Math.max(...data.map((d) => d.value), 1);
  const min = Math.min(...data.map((d) => d.value), 0);
  const range = max - min || 1;
  const stepX = data.length > 1 ? width / (data.length - 1) : width;

  const points = data.map((d, i) => ({
    x: i * stepX,
    y: height - ((d.value - min) / range) * height,
  }));

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const areaPath = `${linePath} L ${points[points.length - 1].x.toFixed(2)} ${height} L 0 ${height} Z`;

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="h-[180px] w-full overflow-visible">
        <defs>
          <linearGradient id="eva-area-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255,255,255,0.16)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#eva-area-fill)" stroke="none" />
        <path
          d={linePath}
          fill="none"
          stroke="rgba(255,255,255,0.75)"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        {points.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={1.4} fill="white" vectorEffect="non-scaling-stroke" />
        ))}
      </svg>
      <div className="mt-2 flex justify-between text-[11px] text-text-tertiary">
        {data.map((d, i) => (
          <span key={i} className={data.length > 10 && i % Math.ceil(data.length / 8) !== 0 ? "opacity-0" : ""}>
            {d.label}
          </span>
        ))}
      </div>
    </div>
  );
}
