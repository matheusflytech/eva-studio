import * as React from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDelta } from "@/lib/design-system/format";

/*
 * Número + rótulo + variação. A variação é escrita ("+12,4%") e tem seta;
 * a cor só reforça. inverse=true quando subir é ruim (ex.: churn).
 */
export function Stat({
  label,
  value,
  delta,
  deltaLabel = "vs. período anterior",
  inverse = false,
  size = "md",
  className,
}: {
  label: string;
  value: React.ReactNode;
  /** Variação em %, ex.: 12.4 ou -3. */
  delta?: number;
  deltaLabel?: string;
  inverse?: boolean;
  size?: "md" | "lg";
  className?: string;
}) {
  const bom = delta === undefined || delta === 0 ? null : inverse ? delta < 0 : delta > 0;
  const Seta = !delta ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <div className={cn("flex min-w-0 flex-col gap-0.5", className)}>
      <span className="truncate text-small text-text-secondary">{label}</span>
      <span className={cn("tabular-nums text-text-primary", size === "lg" ? "text-display font-medium tracking-[-0.035em]" : "text-title font-medium tracking-[-0.02em]")}>{value}</span>
      {delta !== undefined && (
        <span className="flex items-center gap-1 text-caption text-text-tertiary">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-medium tabular-nums",
              bom === null ? "text-text-secondary" : bom ? "text-success" : "text-danger"
            )}
          >
            <Seta size={12} aria-hidden="true" />
            {formatDelta(delta)}
          </span>
          {deltaLabel}
        </span>
      )}
    </div>
  );
}
