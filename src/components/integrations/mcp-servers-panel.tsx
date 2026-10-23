"use client";

import * as React from "react";
import { Plug, Plus, Trash2, RefreshCw, CheckCircle2, AlertTriangle, ChevronDown, Ellipsis } from "lucide-react";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { Modal, ModalContent } from "@/components/ui/modal";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CabecalhoDaSecao, ItemDeConfig, ListaDeConfig, VazioDeConfig } from "@/components/configuracoes/secao";

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
 *
 * v5: lista com linhas finas; "Novo servidor" abre numa janela e Verificar e
 * Remover moram no "…" da linha.
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
    <div>
      <CabecalhoDaSecao
        nivel={2}
        titulo="Servidores MCP"
        descricao="O agente de IA descobre e usa as ferramentas que o servidor anunciar, sem configurar cada chamada."
        acoes={
          <Button variant="primary" onClick={() => setShowForm(true)}>
            <Plus size={14} aria-hidden="true" /> Novo servidor
          </Button>
        }
      />

      {error && !showForm && (
        <Notice tone="danger" className="mb-3">
          {error}
        </Notice>
      )}

      {servers.length === 0 ? (
        <VazioDeConfig>
          Nenhum servidor MCP cadastrado. Depois de cadastrar um, arraste o bloco &quot;Ferramenta: MCP&quot; no Builder e conecte
          na porta roxa de um Agente de IA.
        </VazioDeConfig>
      ) : (
        <ListaDeConfig>
          {servers.map((s) => (
            <ItemDeConfig
              key={s.id}
              icone={<Plug />}
              titulo={s.name}
              detalhe={s.url}
              direita={
                <>
                  <Badge variant={s.active ? "success" : "danger"} dot>
                    {s.active ? `${s.tools.length} ferramenta(s)` : "sem resposta"}
                  </Badge>
                  {s.hasAuth && <Badge>autenticado</Badge>}
                  {s.tools.length > 0 && (
                    <Button variant="ghost" size="sm" aria-expanded={expanded === s.id} onClick={() => setExpanded(expanded === s.id ? null : s.id)}>
                      <ChevronDown size={14} aria-hidden="true" className={expanded === s.id ? "rotate-180 transition-transform" : "transition-transform"} />
                      Ferramentas
                    </Button>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <IconButton aria-label={`Mais ações de ${s.name}`}>
                        <Ellipsis />
                      </IconButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem disabled={busy} onSelect={() => void recheck(s.id)}>
                        <RefreshCw /> Verificar de novo
                      </DropdownMenuItem>
                      <DropdownMenuItem tone="danger" onSelect={() => void remove(s.id)}>
                        <Trash2 /> Remover {s.name}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              }
            >
              {(s.lastError || expanded === s.id) && (
                <div className="flex flex-col gap-2 pb-3 pl-1 sm:pl-12">
                  {s.lastError && (
                    <p className="inline-flex items-start gap-1.5 text-caption text-danger">
                      <AlertTriangle size={13} aria-hidden="true" className="mt-0.5 shrink-0" /> {s.lastError}
                    </p>
                  )}
                  {expanded === s.id && (
                    <ul className="flex flex-col gap-1.5 rounded-[14px] bg-raised p-3">
                      {s.tools.map((t) => (
                        <li key={t.name} className="text-small">
                          <span className="inline-flex items-center gap-1.5 font-medium text-text-primary">
                            <CheckCircle2 size={12} aria-hidden="true" className="text-success" /> {t.name}
                          </span>
                          {t.description && <span className="ml-5 block text-caption text-text-tertiary">{t.description}</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </ItemDeConfig>
          ))}
        </ListaDeConfig>
      )}

      <Modal
        open={showForm}
        onOpenChange={(v) => {
          if (!v) {
            setShowForm(false);
            setError(null);
          }
        }}
      >
        <ModalContent
          title="Novo servidor MCP"
          description="O Eva conecta no endereço e lê as ferramentas que ele anuncia."
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => {
                  setShowForm(false);
                  setError(null);
                }}
              >
                Cancelar
              </Button>
              <Button onClick={create} disabled={busy || !form.name.trim() || !form.url.trim()} loading={busy}>
                Conectar e salvar
              </Button>
            </>
          }
        >
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome">
                <Input id="mcp-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: CRM interno" />
              </Field>
              <Field label="URL">
                <Input id="mcp-url" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} placeholder="https://servidor.exemplo.com/mcp" />
              </Field>
            </div>
            <Field label="Cabeçalho de autenticação (opcional)" hint="Vai inteiro no header Authorization. Guardado cifrado, nunca volta pra tela depois de salvo.">
              <Input
                id="mcp-auth"
                value={form.authHeader}
                onChange={(e) => setForm({ ...form, authHeader: e.target.value })}
                placeholder="Bearer sk-..."
                autoComplete="off"
              />
            </Field>
            {error && <Notice tone="danger">{error}</Notice>}
          </div>
        </ModalContent>
      </Modal>
    </div>
  );
}
