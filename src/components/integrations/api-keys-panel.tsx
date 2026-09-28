"use client";

import * as React from "react";
import Link from "next/link";
import { KeyRound, Plus, Trash2, Copy, Check, AlertTriangle, FileText } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatRelativeDate } from "@/lib/utils";

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
}

// Chaves de API pública (/api/v1/*) — igual Stripe/HubSpot/Salesforce: cria
// uma chave, ela aparece completa SÓ UMA VEZ pra copiar, depois disso só o
// prefixo fica visível pra sempre (o valor de verdade nunca é recuperável,
// só revogável).
export function ApiKeysPanel() {
  const [keys, setKeys] = React.useState<ApiKeyRow[] | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [revealedKey, setRevealedKey] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [origin, setOrigin] = React.useState("");

  React.useEffect(() => setOrigin(window.location.origin), []);

  const load = React.useCallback(() => {
    fetch("/api/api-keys")
      .then((res) => res.json())
      .then((data) => setKeys(data.keys ?? []))
      .catch(() => setKeys([]));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    if (!newName.trim()) {
      setError("Dê um nome pra chave (ex: Produção, n8n).");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar chave.");
      setKeys((prev) => [{ ...data.apiKey, lastUsedAt: null, revokedAt: null }, ...(prev ?? [])]);
      setRevealedKey(data.apiKey.key);
      setCreating(false);
      setNewName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRevoke(id: string) {
    if (!window.confirm("Revogar essa chave? Qualquer integração usando ela vai parar de funcionar imediatamente.")) return;
    setKeys((prev) => (prev ?? []).map((k) => (k.id === id ? { ...k, revokedAt: new Date().toISOString() } : k)));
    await fetch(`/api/api-keys/${id}`, { method: "DELETE" }).catch(() => load());
  }

  async function copyRevealed() {
    if (!revealedKey) return;
    await navigator.clipboard.writeText(revealedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  const activeKeys = (keys ?? []).filter((k) => !k.revokedAt);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">API pública</p>
          <p className="mt-0.5 text-[12px] text-text-tertiary">
            Crie e gerencie leads de fora (sua automação, seu CRM, um script próprio), igual a API do Salesforce/HubSpot.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/integracoes/api" className="flex items-center gap-1 text-[12px] font-medium text-text-tertiary hover:text-text-primary">
            <FileText size={13} /> Documentação
          </Link>
          {!creating && (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-accent-400 hover:text-accent-500"
            >
              <Plus size={13} /> Nova chave
            </button>
          )}
        </div>
      </div>

      {revealedKey && (
        <div className="mb-3 rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
          <div className="mb-2 flex items-center gap-2 text-[12.5px] font-medium text-amber-400">
            <AlertTriangle size={14} /> Copie agora, essa chave não aparece de novo
          </div>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded-lg bg-surface-3 px-3 py-2 font-mono text-[12.5px] text-text-primary">
              {revealedKey}
            </code>
            <button
              type="button"
              onClick={copyRevealed}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-default bg-surface-2 text-text-tertiary hover:text-text-primary"
            >
              {copied ? <Check size={15} className="text-emerald-400" /> : <Copy size={15} />}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setRevealedKey(null)}
            className="mt-2 text-[12px] font-medium text-text-tertiary hover:text-text-primary"
          >
            Já copiei, pode fechar
          </button>
        </div>
      )}

      <div className="glass-card rounded-2xl">
        {creating && (
          <div className="flex flex-col gap-3 border-b border-border-subtle p-4">
            <div>
              <Label>Nome da chave</Label>
              <Input placeholder="Ex: Produção, Integração n8n" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </div>
            {error && <p className="text-[12px] text-danger">{error}</p>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={handleCreate}
                className={buttonVariants({ variant: "solid", size: "sm" })}
              >
                {saving ? "Criando..." : "Criar chave"}
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

        {keys === null ? (
          <p className="p-4 text-[12.5px] text-text-tertiary">Carregando...</p>
        ) : activeKeys.length === 0 ? (
          <p className="p-4 text-[12.5px] text-text-tertiary">
            Nenhuma chave ativa ainda. Crie uma pra gerar/ler/atualizar leads de fora do Eva Studio.
          </p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {activeKeys.map((k) => (
              <div key={k.id} className="flex items-center justify-between gap-4 p-4">
                <div className="flex items-center gap-3.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-text-secondary">
                    <KeyRound size={16} />
                  </span>
                  <div>
                    <p className="text-[13.5px] font-medium text-text-primary">{k.name}</p>
                    <p className="font-mono text-[11.5px] text-text-tertiary">{k.keyPrefix}···</p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-[11.5px] text-text-tertiary">
                    {k.lastUsedAt ? `Usada ${formatRelativeDate(k.lastUsedAt)}` : "Nunca usada"}
                  </span>
                  <Badge variant="neutral">Criada {formatRelativeDate(k.createdAt)}</Badge>
                  <button
                    type="button"
                    onClick={() => handleRevoke(k.id)}
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

      {origin && (
        <div className="mt-3 rounded-2xl border border-border-subtle bg-surface-2 p-3.5">
          <p className={cn("mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary")}>Exemplo</p>
          <pre className="overflow-x-auto rounded-lg bg-surface-3 p-3 font-mono text-[11px] leading-relaxed text-text-secondary">
{`curl ${origin}/api/v1/leads \\
  -H "Authorization: Bearer evs_live_..." \\
  -H "Content-Type: application/json" \\
  -d '{"agentId": "...", "fields": {"nome": "...", "email": "..."}}'`}
          </pre>
        </div>
      )}
    </div>
  );
}
