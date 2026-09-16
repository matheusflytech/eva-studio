"use client";

import * as React from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";

interface CredentialRow {
  id: string;
  name: string;
  type: string;
  createdAt: string;
}

const TYPE_LABEL: Record<string, string> = { groq: "Groq", resend: "Resend" };

function formatAge(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "há 1 dia";
  return `há ${days} dias`;
}

// Credenciais reutilizáveis (Groq, Resend) usadas pelos blocos "Agente de IA
// (nativo)" e "Enviar e-mail" do Builder — igual o jeito que o n8n deixa
// cadastrar uma credencial uma vez e reaproveitar em vários workflows.
export function CredentialsPanel() {
  const [credentials, setCredentials] = React.useState<CredentialRow[] | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [newType, setNewType] = React.useState<"groq" | "resend">("groq");
  const [newSecret, setNewSecret] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    fetch("/api/credentials")
      .then((res) => res.json())
      .then((data) => setCredentials(data.credentials ?? []))
      .catch(() => setCredentials([]));
  }, []);

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
        body: JSON.stringify({ name: newName.trim(), type: newType, secret: newSecret.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar credencial.");
      setCredentials((prev) => [data.credential, ...(prev ?? [])]);
      setCreating(false);
      setNewName("");
      setNewSecret("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setCredentials((prev) => (prev ?? []).filter((c) => c.id !== id));
    await fetch(`/api/credentials/${id}`, { method: "DELETE" }).catch(() => load());
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
          Credenciais (usadas pelos blocos de IA e e-mail do Builder)
        </p>
        {!creating && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="flex items-center gap-1 text-[12px] font-medium text-accent-400 hover:text-accent-500"
          >
            <Plus size={13} /> Nova credencial
          </button>
        )}
      </div>

      <div className="glass-card rounded-2xl">
        {creating && (
          <div className="flex flex-col gap-3 border-b border-border-subtle p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Nome</Label>
                <Input placeholder="Ex: Groq principal" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div>
                <Label>Tipo</Label>
                <Select value={newType} onChange={(e) => setNewType(e.target.value as "groq" | "resend")}>
                  <option value="groq">Groq</option>
                  <option value="resend">Resend</option>
                </Select>
              </div>
            </div>
            <div>
              <Label>Chave de API</Label>
              <Input
                type="password"
                placeholder="Cole a chave de API aqui"
                value={newSecret}
                onChange={(e) => setNewSecret(e.target.value)}
                className="font-mono text-[12px]"
              />
            </div>
            {error && <p className="text-[12px] text-danger">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={handleCreate}
                className={buttonVariants({ variant: "solid", size: "sm" })}
              >
                {saving ? "Salvando..." : "Salvar credencial"}
              </button>
              <button
                type="button"
                onClick={() => { setCreating(false); setError(null); }}
                className="rounded-lg px-3 py-1.5 text-[12px] text-text-tertiary hover:text-text-primary"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {credentials === null ? (
          <p className="p-4 text-[12.5px] text-text-tertiary">Carregando...</p>
        ) : credentials.length === 0 ? (
          <p className="p-4 text-[12.5px] text-text-tertiary">
            Nenhuma credencial cadastrada ainda. Cadastre uma Groq pra usar o bloco &quot;Agente de IA (nativo)&quot; ou uma
            Resend pra usar o bloco &quot;Enviar e-mail&quot; no Builder.
          </p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {credentials.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-text-secondary">
                    <KeyRound size={16} />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-medium text-text-primary">{c.name}</p>
                    <p className="text-[12px] text-text-tertiary">Criada {formatAge(c.createdAt)}</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge variant="accent">{TYPE_LABEL[c.type] ?? c.type}</Badge>
                  <button
                    type="button"
                    onClick={() => handleDelete(c.id)}
                    className="flex h-9 w-9 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-3 hover:text-danger"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
