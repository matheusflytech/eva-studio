import * as React from "react";
import { Target, Zap, GitBranch } from "lucide-react";
import type { FlowStep } from "./types";

function withVariables(text: string) {
  return text.split(/(\{[^}]+\})/g).map((part, i) =>
    part.startsWith("{") && part.endsWith("}") ? (
      <code key={i} className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[11.5px] text-text-primary">
        {part}
      </code>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  );
}

export function CheckpointCard({ step, index }: { step: FlowStep; index: number }) {
  return (
    <div className="glass-card flex-1 overflow-y-auto rounded-3xl p-6">
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-semibold uppercase tracking-wide text-text-tertiary">
          Checkpoint {String(index + 1).padStart(2, "0")}
        </span>
      </div>
      <h2 className="mt-1 font-display text-[19px] font-semibold text-text-primary">{step.title}</h2>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-3 px-2.5 py-1 text-[12px] font-medium text-text-secondary">
          <Target size={12} /> Objetivo
        </span>
        <span className="text-[13px] text-text-secondary">{step.objective}</span>
      </div>

      {step.contextAction && (
        <button
          type="button"
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-surface-2 px-3 py-1.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
        >
          <Zap size={13} /> {step.contextAction}
        </button>
      )}

      {step.bullets && (
        <div className="mt-5">
          <p className="text-[13px] font-medium text-text-primary">Elementos:</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {step.bullets.map((bullet, i) => (
              <li key={i} className="flex items-start gap-2 text-[13px] text-text-secondary">
                <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-text-tertiary" />
                <span>{withVariables(bullet)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {step.conditions && (
        <div className="mt-5 flex flex-col gap-2.5 border-t border-border-subtle pt-4">
          {step.conditions.map((condition, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-[13px] text-text-secondary">
              <span className="rounded-md bg-surface-3 px-2 py-0.5 text-[11.5px] font-semibold text-text-tertiary">
                {condition.trigger}
              </span>
              <span className="inline-flex items-center gap-1 rounded-lg border border-border-default px-2 py-1 text-[12px] font-medium text-text-primary">
                <GitBranch size={12} /> {condition.action}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
