"use client";

import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { ICON_REGISTRY, type IconKey } from "./icon-registry";

export interface FlowNodeData {
  iconKey: IconKey;
  label: string;
  kind?: string;
  detail?: string;
  hasTarget?: boolean;
  hasSource?: boolean;
  [key: string]: unknown;
}

export function FlowNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  const Icon = ICON_REGISTRY[data.iconKey] ?? ICON_REGISTRY.message;
  return (
    <div
      className={cn(
        "glass-card w-[220px] cursor-pointer rounded-2xl p-3.5 transition-colors",
        selected ? "border-border-strong" : "border-border-subtle"
      )}
    >
      {data.hasTarget !== false && (
        <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-none !bg-border-strong" />
      )}
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-3 text-text-tertiary">
          <Icon size={15} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-text-primary">{data.label}</p>
          {data.kind && <p className="truncate text-[11px] text-text-tertiary">{data.kind}</p>}
        </div>
      </div>
      {data.detail && <p className="mt-2.5 line-clamp-2 text-[12px] leading-relaxed text-text-secondary">{data.detail}</p>}
      {data.hasSource !== false && (
        <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-none !bg-border-strong" />
      )}
    </div>
  );
}
