"use client";

import * as React from "react";
import { Handle, Position } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { ICON_REGISTRY, type IconKey } from "./icon-registry";
import { BLOCK_STYLES } from "./block-styles";

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

function AutoTextarea({ value, onCommit }: { value: string; onCommit: (text: string) => void }) {
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => setDraft(value), [value]);

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [draft]);

  return (
    <textarea
      ref={ref}
      value={draft}
      rows={1}
      placeholder="Digite o texto..."
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
      className="nodrag mt-2.5 w-full resize-none overflow-hidden rounded-lg border border-transparent bg-transparent px-1.5 py-1 text-[12px] leading-relaxed text-text-secondary outline-none transition-colors hover:border-border-subtle focus:border-accent-500/50 focus:bg-surface-3"
    />
  );
}

export function FlowNode({
  data,
  selected,
  onDetailChange,
}: {
  data: FlowNodeData;
  selected?: boolean;
  onDetailChange?: (text: string) => void;
}) {
  const Icon = ICON_REGISTRY[data.iconKey] ?? ICON_REGISTRY.message;
  const style = BLOCK_STYLES[data.iconKey] ?? BLOCK_STYLES.message;
  const isCondition = data.iconKey === "condition";
  const options = data.iconKey === "capture" ? data.options ?? [] : [];
  const isMenu = options.length > 0;
  const editableDetail = onDetailChange && data.iconKey !== "condition" && data.iconKey !== "start";

  return (
    <div
      className={cn(
        "glass-card w-[230px] cursor-pointer rounded-2xl border-l-[3px] p-3.5 transition-colors",
        style.border,
        selected ? "border-border-strong ring-1 ring-white/15" : "border-border-subtle"
      )}
    >
      {data.hasTarget !== false && (
        <Handle type="target" position={Position.Top} className="!h-1.5 !w-1.5 !border-none !bg-border-strong" />
      )}
      <div className="flex items-center gap-2.5">
        <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", style.badgeBg, style.badgeText)}>
          <Icon size={15} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-text-primary">{data.label}</p>
          {data.kind && <p className="truncate text-[11px] text-text-tertiary">{data.kind}</p>}
        </div>
      </div>

      {editableDetail ? (
        <AutoTextarea value={data.detail ?? ""} onCommit={(text) => onDetailChange!(text)} />
      ) : (
        data.detail && <p className="mt-2.5 line-clamp-2 text-[12px] leading-relaxed text-text-secondary">{data.detail}</p>
      )}

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
