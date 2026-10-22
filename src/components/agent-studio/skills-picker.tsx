"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

const PRESET_SKILLS = [
  "Atendimento ao cliente",
  "Qualificação de leads",
  "Agendamento",
  "FAQ / Suporte",
  "Vendas consultivas",
  "Follow-up automático",
  "Transferência para humano",
  "Análise de sentimento",
];

export function SkillsPicker({
  skills,
  onChange,
}: {
  skills: string[];
  onChange: (skills: string[]) => void;
}) {
  const [customInput, setCustomInput] = React.useState("");

  function toggle(skill: string) {
    if (skills.includes(skill)) {
      onChange(skills.filter((s) => s !== skill));
    } else {
      onChange([...skills, skill]);
    }
  }

  function addCustom() {
    const value = customInput.trim();
    if (!value || skills.includes(value)) {
      setCustomInput("");
      return;
    }
    onChange([...skills, value]);
    setCustomInput("");
  }

  const customSkills = skills.filter((s) => !PRESET_SKILLS.includes(s));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {PRESET_SKILLS.map((skill) => {
          const active = skills.includes(skill);
          return (
            <button
              key={skill}
              type="button"
              onClick={() => toggle(skill)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-small font-medium transition-colors",
                active
                  ? "border-transparent bg-inverse text-inverse-fg"
                  : "border-border-default bg-raised text-text-secondary hover:border-border-strong hover:text-text-primary"
              )}
            >
              {skill}
            </button>
          );
        })}
      </div>

      {customSkills.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {customSkills.map((skill) => (
            <span
              key={skill}
              className="flex items-center gap-1.5 rounded-full border border-transparent bg-inverse px-3 py-1.5 text-small font-medium text-inverse-fg"
            >
              {skill}
              <button type="button" onClick={() => toggle(skill)} className="text-inverse-fg/70 hover:text-inverse-fg">
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
          placeholder="Adicionar habilidade personalizada…"
        />
      </div>
    </div>
  );
}
