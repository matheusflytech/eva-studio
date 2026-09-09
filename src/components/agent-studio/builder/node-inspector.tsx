"use client";

import { Trash2, X } from "lucide-react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
  const { iconKey } = node.data;

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

        {iconKey === "condition" && (
          <div>
            <Label htmlFor="node-condition">Condição</Label>
            <Textarea
              id="node-condition"
              rows={2}
              placeholder='ex: {opcao} == "comercial"'
              value={node.data.conditionExpression ?? ""}
              onChange={(e) => onChange({ conditionExpression: e.target.value })}
            />
            <p className="mt-1.5 text-[11.5px] text-text-tertiary">
              Conecte a saída <span className="text-emerald-400">Sim</span> e a saída <span className="text-danger">Não</span> a blocos diferentes.
            </p>
          </div>
        )}

        {iconKey === "variable" && (
          <div>
            <Label htmlFor="node-variable">Nome da variável</Label>
            <Input
              id="node-variable"
              placeholder="ex: nome_cliente"
              value={node.data.variableName ?? ""}
              onChange={(e) => onChange({ variableName: e.target.value })}
            />
          </div>
        )}

        {iconKey === "webhook" && (
          <div>
            <Label htmlFor="node-webhook">URL do webhook</Label>
            <Input
              id="node-webhook"
              placeholder="https://seu-n8n.com/webhook/..."
              className="font-mono text-[12.5px]"
              value={node.data.webhookUrl ?? ""}
              onChange={(e) => onChange({ webhookUrl: e.target.value })}
            />
            <Label htmlFor="node-webhook-var" className="mt-3">Guardar resposta na variável</Label>
            <Input
              id="node-webhook-var"
              placeholder="ex: resposta_api"
              value={node.data.variableName ?? ""}
              onChange={(e) => onChange({ variableName: e.target.value })}
            />
          </div>
        )}

        {iconKey === "wait" && (
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="node-wait-duration">Duração</Label>
              <Input
                id="node-wait-duration"
                type="number"
                min={1}
                value={node.data.waitDuration ?? 1}
                onChange={(e) => onChange({ waitDuration: Number(e.target.value) || 1 })}
              />
            </div>
            <div className="flex-1">
              <Label htmlFor="node-wait-unit">Unidade</Label>
              <Select
                id="node-wait-unit"
                value={node.data.waitUnit ?? "minutos"}
                onChange={(e) => onChange({ waitUnit: e.target.value as FlowNodeData["waitUnit"] })}
              >
                <option value="segundos">segundos</option>
                <option value="minutos">minutos</option>
                <option value="horas">horas</option>
              </Select>
            </div>
          </div>
        )}

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
