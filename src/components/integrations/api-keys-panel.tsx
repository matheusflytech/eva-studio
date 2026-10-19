"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { KeyRound, Plus, Trash2, Copy, Check, AlertTriangle, FileText } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatRelativeDate } from "@/lib/utils";
import { RECURSOS } from "@/lib/server/api-v1/escopos";
import { ESCOPO_DA_CHAVE_EXIGE } from "@/lib/permissoes/catalogo";

interface ApiKeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
  revokedAt: string | null;
  scopes?: string[];
  expiresAt?: string | null;
  createdBy?: { id: string; name: string } | null;
}

const VALIDADES = [
  { valor: "", rotulo: "Sem validade" },
  { valor: "30", rotulo: "30 dias" },
  { valor: "90", rotulo: "90 dias" },
  { valor: "365", rotulo: "1 ano" },
];

/** "contacts:read" → "Contatos: ler". */
function rotuloDoEscopo(s: string): string {
  if (s === "*") return "Acesso total";
  const [recurso, acao] = s.split(":");
  const nome = ESCOPO_DA_CHAVE_EXIGE[recurso]?.nome ?? recurso;
  return `${nome}: ${acao === "read" ? "ler" : acao === "write" ? "escrever" : "ler e escrever"}`;
}

// Chaves de API do contrato (/api/v1/*) — igual Pipedrive/HubSpot: cria uma
// chave com nome, o que ela pode (escopos) e, se quiser, até quando vale. Ela
// aparece completa SÓ UMA VEZ pra copiar; depois só o prefixo (o valor de
// verdade nunca é recuperável, só revogável).
export function ApiKeysPanel() {
  const [keys, setKeys] = React.useState<ApiKeyRow[] | null>(null);
  const [podeGerenciar, setPodeGerenciar] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [total, setTotal] = React.useState(true);
  const [escolhidos, setEscolhidos] = React.useState<Set<string>>(new Set());
  const [validade, setValidade] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [revealedKey, setRevealedKey] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [origin, setOrigin] = React.useState("");
  // Momento em que a tela abriu: basta para marcar "vencida" (não precisa de relógio).
  const [agora] = React.useState(() => Date.now());

  React.useEffect(() => setOrigin(window.location.origin), []);

  const load = React.useCallback(() => {
    fetch("/api/api-keys")
      .then((res) => res.json())
      .then((data) => {
        setKeys(data.keys ?? []);
        setPodeGerenciar(!!data.podeGerenciar);
      })
      .catch(() => setKeys([]));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  function alternar(escopo: string) {
    setEscolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(escopo)) novo.delete(escopo);
      else novo.add(escopo);
      return novo;
    });
  }

  async function handleCreate() {
    if (!newName.trim()) {
      setError("Dê um nome pra chave (ex: Produção, n8n).");
      return;
    }
    if (!total && escolhidos.size === 0) {
      setError("Escolha pelo menos uma coisa que a chave pode fazer.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const expiresAt = validade ? new Date(Date.now() + Number(validade) * 86_400_000).toISOString() : null;
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), scopes: total ? ["*"] : [...escolhidos], expiresAt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar chave.");
      setRevealedKey(data.apiKey.key);
      setCreating(false);
      setNewName("");
      setEscolhidos(new Set());
      setTotal(true);
      setValidade("");
      load();
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
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Chaves de API do contrato</p>
          <p className="mt-0.5 text-[12px] text-text-tertiary">
            Conecte sua automação, seu ERP ou um script próprio aos dados deste contrato. Cada chave tem nome, o que pode
            fazer e, se quiser, validade.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <Link href="/integracoes/api" className="flex items-center gap-1 text-[12px] font-medium text-text-tertiary hover:text-text-primary">
            <FileText size={13} /> Documentação
          </Link>
          {!creating && podeGerenciar && (
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
              aria-label="Copiar a chave"
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
          <div className="flex flex-col gap-4 border-b border-border-subtle p-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Nome da chave</Label>
                <Input placeholder="Ex: Produção, Integração n8n" value={newName} onChange={(e) => setNewName(e.target.value)} />
              </div>
              <div>
                <Label>Validade</Label>
                <Select value={validade} onChange={(e) => setValidade(e.target.value)} aria-label="Validade da chave">
                  {VALIDADES.map((v) => (
                    <option key={v.valor} value={v.valor}>
                      {v.rotulo}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div>
              <Label>O que a chave pode fazer</Label>
              <div className="mt-1 flex flex-wrap gap-2">
                {[
                  { v: true, t: "Tudo que eu posso" },
                  { v: false, t: "Escolher" },
                ].map((o) => (
                  <button
                    key={o.t}
                    type="button"
                    onClick={() => setTotal(o.v)}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-[12.5px] transition-colors",
                      total === o.v
                        ? "border-accent-500 bg-accent-500/10 text-text-primary"
                        : "border-border-default text-text-secondary hover:text-text-primary"
                    )}
                  >
                    {o.t}
                  </button>
                ))}
              </div>
              {!total && (
                <div className="mt-3 overflow-hidden rounded-xl border border-border-subtle">
                  <table className="w-full text-[12.5px]">
                    <thead className="bg-surface-2 text-[11px] uppercase tracking-wide text-text-tertiary">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Dados</th>
                        <th className="px-3 py-2 font-semibold">Ler</th>
                        <th className="px-3 py-2 font-semibold">Criar e editar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {RECURSOS.map((r) => (
                        <tr key={r} className="border-t border-border-subtle">
                          <td className="px-3 py-2 text-text-secondary">{ESCOPO_DA_CHAVE_EXIGE[r]?.nome ?? r}</td>
                          {(["read", "write"] as const).map((a) => (
                            <td key={a} className="px-3 py-2 text-center">
                              <Checkbox
                                className="mx-auto"
                                checked={escolhidos.has(`${r}:${a}`)}
                                onCheckedChange={() => alternar(`${r}:${a}`)}
                                aria-label={`${ESCOPO_DA_CHAVE_EXIGE[r]?.nome ?? r}: ${a === "read" ? "ler" : "criar e editar"}`}
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="mt-2 text-[11.5px] text-text-tertiary">
                A chave nunca pode mais do que você: se seu papel não edita negócios, a chave também não edita.
              </p>
            </div>

            {error && <p className="text-[12px] text-danger">{error}</p>}
            <div className="flex gap-2">
              <button type="button" disabled={saving} onClick={handleCreate} className={buttonVariants({ variant: "solid", size: "sm" })}>
                {saving ? "Criando..." : "Criar chave"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setError(null);
                }}
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
            Nenhuma chave ativa ainda.{podeGerenciar ? " Crie uma para ler e gravar dados deste contrato de fora do Eva." : ""}
          </p>
        ) : (
          <div className="divide-y divide-border-subtle">
            {activeKeys.map((k) => {
              const vencida = k.expiresAt ? new Date(k.expiresAt).getTime() <= agora : false;
              const escopos = k.scopes?.length ? k.scopes : ["*"];
              return (
                <div key={k.id} className="flex flex-wrap items-center justify-between gap-4 p-4">
                  <div className="flex min-w-0 items-center gap-3.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-text-secondary">
                      <KeyRound size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[13.5px] font-medium text-text-primary">{k.name}</p>
                      <p className="font-mono text-[11.5px] text-text-tertiary">{k.keyPrefix}···</p>
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {escopos.slice(0, 4).map((s) => (
                          <Badge key={s} variant="neutral" className="text-[11px]">
                            {rotuloDoEscopo(s)}
                          </Badge>
                        ))}
                        {escopos.length > 4 && (
                          <Badge variant="neutral" className="text-[11px]" title={escopos.map(rotuloDoEscopo).join(", ")}>
                            +{escopos.length - 4}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-3">
                    <span className="text-[11.5px] text-text-tertiary">
                      {k.lastUsedAt ? `Usada ${formatRelativeDate(k.lastUsedAt)}` : "Nunca usada"}
                    </span>
                    {k.expiresAt && (
                      <Badge variant={vencida ? "danger" : "neutral"}>
                        {vencida ? "Vencida" : `Vale até ${new Date(k.expiresAt).toLocaleDateString("pt-BR")}`}
                      </Badge>
                    )}
                    <Badge variant="neutral">
                      Criada {formatRelativeDate(k.createdAt)}
                      {k.createdBy ? ` por ${k.createdBy.name}` : ""}
                    </Badge>
                    {podeGerenciar && (
                      <button
                        type="button"
                        onClick={() => handleRevoke(k.id)}
                        aria-label={`Revogar a chave ${k.name}`}
                        title="Revogar"
                        className="flex h-9 w-9 items-center justify-center rounded-lg text-text-tertiary transition-colors hover:bg-surface-3 hover:text-danger"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {origin && (
        <div className="mt-3 rounded-2xl border border-border-subtle bg-surface-2 p-3.5">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Exemplo</p>
          <pre className="overflow-x-auto rounded-lg bg-surface-3 p-3 font-mono text-[11px] leading-relaxed text-text-secondary">
{`curl ${origin}/api/v1/contacts \\
  -H "Authorization: Bearer evs_live_..."`}
          </pre>
        </div>
      )}
    </div>
  );
}
