"use client";

import { Plus, Trash2 } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { generateId } from "@/lib/utils";
import type { KeyValueRow } from "./flow-node";

// Editor de lista chave/valor reutilizável (headers, query params) — mesmo
// padrão visual já usado pra editar as opções (botões) do bloco Captura.
export function KeyValueList({
  label,
  rows,
  onChange,
  keyPlaceholder = "chave",
  valuePlaceholder = "valor",
}: {
  label: string;
  rows: KeyValueRow[];
  onChange: (rows: KeyValueRow[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Label className="mb-0">{label}</Label>
        <button
          type="button"
          onClick={() => onChange([...rows, { id: generateId(), key: "", value: "" }])}
          className="flex items-center gap-1 text-[11.5px] font-medium text-accent-400 hover:text-accent-500"
        >
          <Plus size={12} /> Adicionar
        </button>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((row, i) => (
          <div key={row.id} className="flex items-center gap-1.5">
            <Input
              value={row.key}
              placeholder={keyPlaceholder}
              className="w-[90px] shrink-0"
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...next[i], key: e.target.value };
                onChange(next);
              }}
            />
            <Input
              value={row.value}
              placeholder={valuePlaceholder}
              onChange={(e) => {
                const next = [...rows];
                next[i] = { ...next[i], value: e.target.value };
                onChange(next);
              }}
            />
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
              className="shrink-0 rounded-lg p-2 text-text-tertiary hover:bg-surface-3 hover:text-danger"
            >
              <Trash2 size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
