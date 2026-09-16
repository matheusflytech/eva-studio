"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface CredentialOption {
  id: string;
  name: string;
  type: string;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = { groq: "Groq", resend: "Resend" };

// Select de credencial (Groq/Resend) com "+ Nova credencial" inline — igual o
// jeito que o n8n deixa criar uma credencial sem sair do node. A chave em si
// nunca volta pro cliente depois de criada (só id/nome/tipo).
export function CredentialSelect({
  type,
  value,
  onChange,
  label,
}: {
  type: "groq" | "resend";
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  label: string;
}) {
  const [options, setOptions] = React.useState<CredentialOption[] | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newSecret, setNewSecret] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    fetch(`/api/credentials?type=${type}`)
      .then((res) => res.json())
      .then((data) => setOptions(data.credentials ?? []))
      .catch(() => setOptions([]));
  }, [type]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    if (!newName.trim() || !newSecret.trim()) {
      setError("Preencha nome e chave.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), type, secret: newSecret.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar credencial.");
      setOptions((prev) => [data.credential, ...(prev ?? [])]);
      onChange(data.credential.id);
      setCreating(false);
      setNewName("");
      setNewSecret("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  if (creating) {
    return (
      <div className="rounded-xl border border-border-default bg-surface-2 p-2.5">
        <p className="mb-2 text-[11.5px] font-medium text-text-primary">Nova credencial {TYPE_LABEL[type]}</p>
        <div className="flex flex-col gap-2">
          <Input placeholder="Nome (ex: Groq principal)" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <Input
            placeholder="Cole a chave de API aqui"
            type="password"
            value={newSecret}
            onChange={(e) => setNewSecret(e.target.value)}
          />
          {error && <p className="text-[11px] text-danger">{error}</p>}
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={saving}
              onClick={handleCreate}
              className="flex-1 rounded-lg bg-accent-500 px-2 py-1.5 text-[12px] font-medium text-white hover:bg-accent-600 disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => { setCreating(false); setError(null); }}
              className="rounded-lg px-2 py-1.5 text-[12px] text-text-tertiary hover:text-text-primary"
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <Label className="mb-0">{label}</Label>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex items-center gap-1 text-[11.5px] font-medium text-accent-400 hover:text-accent-500"
        >
          <Plus size={12} /> Nova
        </button>
      </div>
      <Select value={value ?? ""} onChange={(e) => onChange(e.target.value || undefined)} disabled={options === null}>
        <option value="">Escolha uma credencial...</option>
        {(options ?? []).map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </Select>
      {options?.length === 0 && (
        <p className="mt-1.5 text-[11.5px] text-text-tertiary">
          Nenhuma credencial {TYPE_LABEL[type]} ainda — clique em &quot;Nova&quot; ou cadastre em Integrações.
        </p>
      )}
    </div>
  );
}
