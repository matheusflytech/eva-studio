"use client";

import { Trash2, X } from "lucide-react";
import { Input, Textarea, Label } from "@/components/ui/input";
import type { Node } from "@xyflow/react";
import type { FlowNodeData } from "./flow-node";

export function NodeInspector({
  node,
  onChange,
  onDelete,
  onClose,
}: {
  node: Node<FlowNodeData>;
  onChange: (data: Partial<FlowNodeData>) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  return (
    <div className="glass-card w-[260px] rounded-2xl p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Bloco selecionado</p>
        <button type="button" onClick={onClose} className="text-text-tertiary transition-colors hover:text-text-primary">
          <X size={14} />
        </button>
      </div>
      <div className="flex flex-col gap-3">
        <div>
          <Label htmlFor="node-label">Nome</Label>
          <Input id="node-label" value={node.data.label} onChange={(e) => onChange({ label: e.target.value })} />
        </div>
        <div>
          <Label htmlFor="node-detail">Detalhe / mensagem</Label>
          <Textarea
            id="node-detail"
            rows={4}
            value={node.data.detail ?? ""}
            onChange={(e) => onChange({ detail: e.target.value })}
          />
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-danger/20 bg-danger/10 px-3 py-2 text-[12.5px] font-medium text-danger transition-colors hover:bg-danger/20"
        >
          <Trash2 size={13} /> Excluir bloco
        </button>
      </div>
    </div>
  );
}
