// Deterministic pseudo-random series generator for mock dashboard data.
// Seeded so a given agent/variable always renders the same "history" during a session.
function seededRandom(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return () => {
    h = (h * 1103515245 + 12345) >>> 0;
    return (h % 1000) / 1000;
  };
}

export function generateSeries(seed: string, points: number, base: number, volatility: number): number[] {
  const rand = seededRandom(seed);
  const series: number[] = [];
  let value = base;
  for (let i = 0; i < points; i++) {
    value = Math.max(0, value + (rand() - 0.45) * volatility);
    series.push(Math.round(value));
  }
  return series;
}

export function lastNDaysLabels(n: number): string[] {
  const labels: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    labels.push(i === 0 ? "Hoje" : `-${i}d`);
  }
  return labels;
}
