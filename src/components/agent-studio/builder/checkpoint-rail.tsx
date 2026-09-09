"use client";

import { cn } from "@/lib/utils";
import type { FlowStep } from "./types";

export function CheckpointRail({
  steps,
  activeId,
  onSelect,
}: {
  steps: FlowStep[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      {steps.map((step, i) => {
        const isActive = step.id === activeId;
        return (
          <div key={step.id} className="relative">
            {i < steps.length - 1 && (
              <span className="absolute left-[15px] top-8 h-[calc(100%-6px)] w-px bg-border-subtle" />
            )}
            <button
              onClick={() => onSelect(step.id)}
              className="relative z-10 flex w-full items-start gap-3 rounded-xl p-2 text-left transition-colors hover:bg-surface-2"
            >
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-colors",
                  isActive ? "bg-ice text-bg-base" : "bg-surface-3 text-text-tertiary"
                )}
              >
                {i + 1}
              </span>
              <span
                className={cn(
                  "mt-0.5 text-[13px] font-medium transition-colors",
                  isActive ? "text-text-primary" : "text-text-secondary"
                )}
              >
                {step.title}
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
