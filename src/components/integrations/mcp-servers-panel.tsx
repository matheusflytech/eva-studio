"use client";

import * as React from "react";
import { Plug, Plus, Trash2, RefreshCw, Loader2, CheckCircle2, AlertTriangle, ChevronDown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface McpTool {
  name: string;
  description?: string;
}

interface McpServerRow {
  id: string;
  name: string;
  url: string;
  hasAuth: boolean;
  active: boolean;
  tools: McpTool[];
  lastCheckAt: string | null;
  lastError: string | null;
}

/**
 * Servidores MCP da organização.
 *
 * MCP (Model Context Protocol) é o protocolo aberto que padroniza "aqui estão
 * minhas ferramentas". Em vez de configurar uma chamada HTTP por integração,
 * o servidor se apresenta e o agente de IA descobre sozinho o que dá pra
 * fazer — e passa a poder usar isso dentro de qualquer fluxo.
 */
export function McpServersPanel() {
  const [servers, setServers] = React.useState<McpServerRow[]>([]);
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({ name: "", url: "", authHeader: "" });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [expanded, setExpanded] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    const res = await fetch("/api/mcp-servers");
    if (!res.ok) return;
    const data = await res.json();
    setServers(data.servers ?? []);
  }, []);

  React.useEffect(() => { refresh(); }, [refresh]);

  async function create() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/mcp-servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? "Não foi possível cadastrar.");
      return;
    }
    if (!data.connected) setError(data.server?.lastError ?? "Cadastrado, mas o servidor não respondeu.");
    setForm({ name: "", url: "", authHeader: "" });
    setShowForm(false);
    refresh();
  }

  async function recheck(id: string) {
    setBusy(true);
    await fetch("/api/mcp-servers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setBusy(false);
    refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/mcp-servers?id=${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Plug size={16} className="text-text-tertiary" /> Servidores MCP
            </CardTitle>
            <CardDescription>
              O agente de IA descobre e usa as ferramentas que o servidor anunciar, sem configurar cada chamada.
            </CardDescription>
          </div>
          <Button variant="secondary" onClick={() => setShowForm(!showForm)}>
            <Plus size={15} /> Novo servidor
          </Button>
        </div>
      </CardHeader>

      {showForm && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl bg-surface-2 px-4 py-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="mcp-name">Nome</Label>
              <Input
                id="mcp-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ex: CRM interno"
              />
            </div>
            <div>
              <Label htmlFor="mcp-url">URL</Label>
              <Input
                id="mcp-url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://servidor.exemplo.com/mcp"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="mcp-auth">Cabeçalho de autenticação (opcional)</Label>
            <Input
              id="mcp-auth"
              value={form.authHeader}
              onChange={(e) => setForm({ ...form, authHeader: e.target.value })}
              placeholder="Bearer sk-..."
              autoComplete="off"
            />
            <p className="mt-1.5 text-[11.5px] text-text-tertiary">
              Vai inteiro no header Authorization. Guardado cifrado, nunca volta pra tela depois de salvo.
            </p>
          </div>
          {error && <p className="text-[13px] text-danger">{error}</p>}
          <div className="flex gap-2">
            <Button onClick={create} disabled={busy || !form.name.trim() || !form.url.trim()}>
              {busy && <Loader2 size={15} className="animate-spin" />} Conectar e salvar
            </Button>
            <Button variant="ghost" onClick={() => { setShowForm(false); setError(null); }}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {servers.length === 0 ? (
        <p className="text-[13px] text-text-tertiary">
          Nenhum servidor MCP cadastrado. Depois de cadastrar um, arraste o bloco &quot;Ferramenta: MCP&quot; no
          Builder e conecte na porta roxa de um Agente de IA.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {servers.map((s) => (
            <div key={s.id} className="rounded-2xl bg-surface-2 px-4 py-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-text-primary">{s.name}</span>
                    <Badge variant={s.active ? "success" : "danger"}>
                      {s.active ? `${s.tools.length} ferramenta(s)` : "sem resposta"}
                    </Badge>
                    {s.hasAuth && <Badge>autenticado</Badge>}
                  </div>
                  <div className="truncate text-[12px] text-text-tertiary">{s.url}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {s.tools.length > 0 && (
                    <Button
                      variant="ghost"
                      onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                    >
                      <ChevronDown
                        size={15}
                        className={expanded === s.id ? "rotate-180 transition-transform" : "transition-transform"}
                      />
                      Ferramentas
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => recheck(s.id)} disabled={busy}>
                    <RefreshCw size={15} /> Verificar
                  </Button>
                  <button
                    onClick={() => remove(s.id)}
                    className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-danger/10 hover:text-danger"
                    aria-label={`Remover ${s.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {s.lastError && (
                <p className="mt-2 inline-flex items-start gap-1.5 text-[12px] text-danger">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {s.lastError}
                </p>
              )}

              {expanded === s.id && (
                <ul className="mt-3 flex flex-col gap-1.5 border-t border-border-subtle pt-3">
                  {s.tools.map((t) => (
                    <li key={t.name} className="text-[12.5px]">
                      <span className="inline-flex items-center gap-1.5 font-medium text-text-primary">
                        <CheckCircle2 size={12} className="text-emerald-400" /> {t.name}
                      </span>
                      {t.description && (
                        <span className="ml-5 block text-[11.5px] text-text-tertiary">{t.description}</span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
