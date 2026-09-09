"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const PRESET_TOOLS = [
  "Buscar CEP",
  "Consultar CRM",
  "Criar evento na agenda",
  "Enviar e-mail",
  "Consultar tabela de preços",
  "Gerar link de pagamento",
  "Buscar status de pedido",
  "Registrar atendimento",
];

export function ToolsPicker({
  tools,
  onChange,
}: {
  tools: string[];
  onChange: (tools: string[]) => void;
}) {
  const [customInput, setCustomInput] = React.useState("");

  function toggle(tool: string) {
    if (tools.includes(tool)) {
      onChange(tools.filter((t) => t !== tool));
    } else {
      onChange([...tools, tool]);
    }
  }

  function addCustom() {
    const value = customInput.trim();
    if (!value || tools.includes(value)) {
      setCustomInput("");
      return;
    }
    onChange([...tools, value]);
    setCustomInput("");
  }

  const customTools = tools.filter((t) => !PRESET_TOOLS.includes(t));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-text-tertiary">
        Ações que o agente pode executar durante a conversa — cada uma chama um webhook no seu workflow do n8n.
      </p>
      <div className="flex flex-wrap gap-2">
        {PRESET_TOOLS.map((tool) => {
          const active = tools.includes(tool);
          return (
            <button
              key={tool}
              type="button"
              onClick={() => toggle(tool)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition-colors",
                active
                  ? "border-ice-border bg-ice-soft text-ice"
                  : "border-border-default bg-surface-2 text-text-secondary hover:border-border-strong hover:text-text-primary"
              )}
            >
              {tool}
            </button>
          );
        })}
      </div>

      {customTools.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customTools.map((tool) => (
            <span
              key={tool}
              className="flex items-center gap-1.5 rounded-full border border-ice-border bg-ice-soft px-3 py-1.5 text-[13px] font-medium text-ice"
            >
              {tool}
              <button type="button" onClick={() => toggle(tool)} className="text-ice/70 hover:text-ice">
                <X size={13} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          value={customInput}
          onChange={(e) => setCustomInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addCustom();
            }
          }}
          placeholder="Adicionar tool personalizada..."
        />
      </div>
    </div>
  );
}
