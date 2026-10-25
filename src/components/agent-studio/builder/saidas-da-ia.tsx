"use client";

import { Plus, Trash2 } from "lucide-react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { generateId } from "@/lib/utils";
import type { AiExit, AiExitField } from "./flow-node";

// ---------------------------------------------------------------------------
// Saídas por intenção do bloco de IA (aba "Saídas"): cada uma vira uma porta
// no card e uma ferramenta "sair_<nome>" para a IA. Os campos são o que a IA
// preenche ao sair; viram variáveis do fluxo (motor: flow-engine.ts).
// ---------------------------------------------------------------------------

const TIPOS: { value: AiExitField["type"]; label: string }[] = [
  { value: "string", label: "Texto" },
  { value: "number", label: "Número" },
  { value: "boolean", label: "Sim/Não" },
];

export function SaidasDaIa({ saidas, onChange }: { saidas: AiExit[]; onChange: (saidas: AiExit[]) => void }) {
  const mudar = (i: number, parte: Partial<AiExit>) => onChange(saidas.map((s, j) => (j === i ? { ...s, ...parte } : s)));

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-text-tertiary">
        A IA lê o nome e o &quot;quando usar&quot; de cada saída e escolhe por qual a conversa segue. Ligue cada porta
        no card ao bloco de destino. <strong>Terminou</strong> continua valendo para quando ela só encerra a parte dela;{" "}
        <strong>Erro</strong>, para quando o provedor falha.
      </p>

      {saidas.map((s, i) => (
        <div key={s.id} className="flex flex-col gap-2.5 rounded-[14px] border border-border-subtle bg-raised p-3">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <Label htmlFor={`saida-nome-${s.id}`}>Nome da saída</Label>
              <Input
                id={`saida-nome-${s.id}`}
                placeholder="ex: Dúvida técnica"
                value={s.name}
                onChange={(e) => mudar(i, { name: e.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={() => onChange(saidas.filter((_, j) => j !== i))}
              aria-label={`Remover a saída ${s.name || i + 1}`}
              className="shrink-0 rounded-lg p-2 text-text-tertiary hover:bg-hover hover:text-danger"
            >
              <Trash2 size={14} />
            </button>
          </div>
          <div>
            <Label htmlFor={`saida-desc-${s.id}`}>Quando usar</Label>
            <Textarea
              id={`saida-desc-${s.id}`}
              rows={2}
              placeholder="ex: o cliente relata defeito ou problema de uso do produto"
              value={s.description}
              onChange={(e) => mudar(i, { description: e.target.value })}
            />
          </div>
          <CamposDaSaida campos={s.fields ?? []} onChange={(fields) => mudar(i, { fields })} />
        </div>
      ))}

      <button
        type="button"
        onClick={() => onChange([...saidas, { id: generateId(), name: "", description: "", fields: [] }])}
        className="flex h-9 items-center justify-center gap-1.5 rounded-full border border-dashed border-border-default text-small font-medium text-text-secondary transition-colors hover:border-accent-solid hover:text-text-primary"
      >
        <Plus size={14} aria-hidden="true" /> Adicionar saída
      </button>
    </div>
  );
}

function CamposDaSaida({ campos, onChange }: { campos: AiExitField[]; onChange: (campos: AiExitField[]) => void }) {
  const mudar = (i: number, parte: Partial<AiExitField>) => onChange(campos.map((c, j) => (j === i ? { ...c, ...parte } : c)));
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Label className="mb-0">Campos que a IA preenche ao sair</Label>
        <button
          type="button"
          onClick={() => onChange([...campos, { id: generateId(), key: "", type: "string", description: "", required: true }])}
          className="flex items-center gap-1 text-caption font-medium text-accent-fg"
        >
          <Plus size={12} aria-hidden="true" /> Adicionar
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {campos.map((c, i) => (
          <div key={c.id} className="flex flex-col gap-1.5 rounded-[10px] bg-panel p-2">
            <div className="flex items-center gap-1.5">
              <Input
                aria-label="Variável"
                placeholder="variavel"
                className="min-w-0 flex-1"
                value={c.key}
                onChange={(e) => mudar(i, { key: e.target.value.replace(/\s+/g, "_") })}
              />
              <Select
                aria-label="Tipo"
                className="w-[110px] shrink-0"
                value={c.type}
                onChange={(e) => mudar(i, { type: e.target.value as AiExitField["type"] })}
              >
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </Select>
              <button
                type="button"
                onClick={() => onChange(campos.filter((_, j) => j !== i))}
                aria-label={`Remover o campo ${c.key || i + 1}`}
                className="shrink-0 rounded-lg p-2 text-text-tertiary hover:bg-hover hover:text-danger"
              >
                <Trash2 size={13} />
              </button>
            </div>
            <Input
              aria-label="Descrição do campo"
              placeholder="o que é (a IA lê isto)"
              value={c.description}
              onChange={(e) => mudar(i, { description: e.target.value })}
            />
            <label className="flex items-center justify-between gap-2 text-caption text-text-secondary">
              Obrigatório: a IA pergunta antes de sair
              <Switch checked={c.required} onCheckedChange={(v) => mudar(i, { required: v })} aria-label="Obrigatório" />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
