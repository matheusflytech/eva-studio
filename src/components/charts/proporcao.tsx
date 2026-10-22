import { cn } from "@/lib/utils";
import type { ChartPoint } from "./area-chart";

// Duas leituras curtas de "quanto de cada um", para o resumo do Dashboard:
//  - BarraEmPilha: uma barra única dividida pelas partes (na ordem que vierem,
//    ex.: etapas do funil), a maior em azul de destaque e as outras em tom
//    neutro, com as três maiores escritas embaixo.
//  - Porcentagens: as três maiores partes em número grande e o resto somado
//    em "Outros".

export function BarraEmPilha({
  data,
  formatarValor = (v) => v.toLocaleString("pt-BR"),
  destaques = 3,
}: {
  data: ChartPoint[];
  formatarValor?: (v: number) => string;
  destaques?: number;
}) {
  const partes = data.filter((p) => p.value > 0);
  const total = partes.reduce((s, p) => s + p.value, 0);
  if (!total) return null;
  const maior = Math.max(...partes.map((p) => p.value));
  const top = [...partes].sort((a, b) => b.value - a.value).slice(0, destaques);
  return (
    <div>
      <div
        className="flex h-2.5 gap-[3px] overflow-hidden rounded-full"
        role="img"
        aria-label={partes.map((p) => `${p.label}: ${formatarValor(p.value)}`).join(", ")}
      >
        {partes.map((p) => (
          <i
            key={p.label}
            title={`${p.label} · ${formatarValor(p.value)}`}
            className={cn("block h-full min-w-1 rounded-full", p.value === maior ? "bg-accent-solid" : "bg-hover")}
            style={{ width: `${(p.value / total) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
        {top.map((p) => (
          <li key={p.label} className="flex min-w-0 flex-col text-small text-text-secondary">
            <b className="truncate text-body-lg font-medium text-text-primary">{p.label}</b>
            <span className="tabular-nums">{formatarValor(p.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Porcentagens({ data, destaques = 2 }: { data: ChartPoint[]; destaques?: number }) {
  const partes = [...data.filter((p) => p.value > 0)].sort((a, b) => b.value - a.value);
  const total = partes.reduce((s, p) => s + p.value, 0);
  if (!total) return null;
  // Até `destaques` partes com nome; o resto (se houver mais de uma) vira "Outros".
  const mostradas = partes.length <= destaques + 1 ? partes : partes.slice(0, destaques);
  const outros = partes.slice(mostradas.length).reduce((s, p) => s + p.value, 0);
  const itens = outros > 0 ? [...mostradas, { label: "Outros", value: outros }] : mostradas;
  return (
    <ul className="flex flex-wrap gap-x-7 gap-y-3">
      {itens.map((p, i) => (
        <li key={p.label} className="flex min-w-0 flex-col">
          <b className={cn("text-display font-light tracking-[-0.04em] tabular-nums", i === 0 ? "text-accent-fg" : "text-text-primary")}>
            {Math.round((p.value / total) * 100)}%
          </b>
          <span className="truncate text-small text-text-tertiary">{p.label}</span>
        </li>
      ))}
    </ul>
  );
}
