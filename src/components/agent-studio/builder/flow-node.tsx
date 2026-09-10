"use client";

import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { ICON_REGISTRY, type IconKey } from "./icon-registry";

export interface MenuOption {
  id: string;
  label: string;
}

export interface FlowNodeData {
  iconKey: IconKey;
  label: string;
  kind?: string;
  detail?: string;
  hasTarget?: boolean;
  hasSource?: boolean;
  webhookUrl?: string;
  waitDuration?: number;
  waitUnit?: "segundos" | "minutos" | "horas";
  variableName?: string;
  conditionExpression?: string;
  options?: MenuOption[];
  [key: string]: unknown;
}

function ConfigPreview({ data }: { data: FlowNodeData }) {
  if (data.iconKey === "webhook" && data.webhookUrl) {
    return <p className="mt-2 truncate rounded-lg bg-surface-3 px-2 py-1 font-mono text-[10.5px] text-text-tertiary">{data.webhookUrl}</p>;
  }
  if (data.iconKey === "wait" && data.waitDuration) {
    return <p className="mt-2 text-[11px] text-text-tertiary">Espera {data.waitDuration} {data.waitUnit ?? "minutos"}</p>;
  }
  if (data.iconKey === "variable" && data.variableName) {
    return <p className="mt-2 truncate rounded-lg bg-surface-3 px-2 py-1 font-mono text-[10.5px] text-text-tertiary">{"{" + data.variableName + "}"}</p>;
  }
  return null;
}

export function FlowNode({ data, selected }: { data: FlowNodeData; selected?: boolean }) {
  const Icon = ICON_REGISTRY[data.iconKey] ?? ICON_REGISTRY.message;
  const isCondition = data.iconKey === "condition";
  const options = data.iconKey === "capture" ? data.options ?? [] : [];
  const isMenu = options.length > 0;

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
      <ConfigPreview data={data} />

      {isMenu && (
        <div className="mt-2.5 flex flex-col gap-1">
          {options.map((opt) => (
            <div key={opt.id} className="truncate rounded-lg border border-border-subtle bg-surface-3 px-2 py-1 text-[11px] text-text-secondary">
              {opt.label || "(sem texto)"}
            </div>
          ))}
        </div>
      )}

      {isCondition ? (
        <>
          <div className="pointer-events-none mt-3 flex justify-between text-[10px] font-medium">
            <span className="text-emerald-400">Sim</span>
            <span className="text-danger">Não</span>
          </div>
          <Handle
            id="true"
            type="source"
            position={Position.Bottom}
            style={{ left: "25%" }}
            className="!h-1.5 !w-1.5 !border-none !bg-emerald-400"
          />
          <Handle
            id="false"
            type="source"
            position={Position.Bottom}
            style={{ left: "75%" }}
            className="!h-1.5 !w-1.5 !border-none !bg-danger"
          />
        </>
      ) : isMenu ? (
        options.map((opt, i) => (
          <Handle
            key={opt.id}
            id={opt.id}
            type="source"
            position={Position.Bottom}
            style={{ left: `${((i + 1) / (options.length + 1)) * 100}%` }}
            className="!h-1.5 !w-1.5 !border-none !bg-accent-500"
          />
        ))
      ) : (
        data.hasSource !== false && (
          <Handle type="source" position={Position.Bottom} className="!h-1.5 !w-1.5 !border-none !bg-border-strong" />
        )
      )}
    </div>
  );
}
