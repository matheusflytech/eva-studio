"use client";

import * as React from "react";
import { Plus, X, Variable } from "lucide-react";
import { Input } from "@/components/ui/input";
import { generateId } from "@/lib/utils";
import type { AgentVariable } from "@/lib/data/types";

export function VariablesEditor({
  variables,
  onChange,
}: {
  variables: AgentVariable[];
  onChange: (variables: AgentVariable[]) => void;
}) {
  const [name, setName] = React.useState("");
  const [unit, setUnit] = React.useState("");

  function add() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onChange([...variables, { id: generateId(), name: trimmed, unit: unit.trim() }]);
    setName("");
    setUnit("");
  }

  function remove(id: string) {
    onChange(variables.filter((v) => v.id !== id));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-text-tertiary">
        Métricas que esse agente vai acompanhar — aparecem como séries selecionáveis no Dashboard.
      </p>

      {variables.length > 0 && (
        <div className="flex flex-col gap-2">
          {variables.map((v) => (
            <div
              key={v.id}
              className="flex items-center justify-between rounded-xl border border-border-default bg-surface-2 px-3.5 py-2.5"
            >
              <div className="flex items-center gap-2.5">
                <Variable size={14} className="text-text-tertiary" />
                <div>
                  <p className="text-[13px] font-medium text-text-primary">{v.name}</p>
                  {v.unit && <p className="text-[11.5px] text-text-tertiary">{v.unit}</p>}
                </div>
              </div>
              <button
                type="button"
                onClick={() => remove(v.id)}
                className="text-text-tertiary transition-colors hover:text-text-primary"
              >
                <X size={15} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nome da variável, ex: Leads qualificados"
        />
        <Input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Unidade (opcional)"
          className="w-[160px]"
        />
        <button
          type="button"
          onClick={add}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border-default bg-surface-2 text-text-tertiary transition-colors hover:border-border-strong hover:text-text-primary"
        >
          <Plus size={16} />
        </button>
      </div>
    </div>
  );
}
