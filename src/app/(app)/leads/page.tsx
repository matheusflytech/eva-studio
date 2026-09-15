"use client";

import * as React from "react";
import { Download, X, Mail, Phone, Plus, Trash2, Code2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { cn, formatRelativeDate, generateId } from "@/lib/utils";

interface Lead {
  id: string;
  agentId: string;
  agentName: string;
  contactId: string;
  variables: Record<string, unknown>;
  leadStage: string;
  createdAt: string;
  updatedAt: string;
  lastMessage: { text: string; role: string } | null;
}

interface Message {
  id: string;
  role: string;
  text: string;
  createdAt: string;
}

const STAGES = ["novo", "contatado", "qualificado", "ganho", "perdido"] as const;

const STAGE_LABEL: Record<string, string> = {
  novo: "Novo",
  contatado: "Contatado",
  qualificado: "Qualificado",
  ganho: "Ganho",
  perdido: "Perdido",
};

const STAGE_DOT: Record<string, string> = {
  novo: "bg-text-tertiary",
  contatado: "bg-ice",
  qualificado: "bg-accent-400",
  ganho: "bg-emerald-400",
  perdido: "bg-danger",
};

function pick(vars: Record<string, unknown>, candidates: string[]): string | null {
  for (const key of candidates) {
    const value = vars?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function leadName(lead: Lead): string {
  return pick(lead.variables, ["nome", "nome_cliente", "name", "nome_completo"]) ?? lead.contactId;
}
function leadEmail(lead: Lead): string | null {
  return pick(lead.variables, ["email", "e-mail", "email_cliente"]);
}
function leadPhone(lead: Lead): string | null {
  return pick(lead.variables, ["telefone", "telefone_cliente", "phone", "whatsapp"]);
}

function exportCsv(leads: Lead[]) {
  const varKeys = Array.from(new Set(leads.flatMap((l) => Object.keys(l.variables ?? {})))).filter((k) => !k.startsWith("__"));
  const header = ["Agente", "Estágio", "Criado em", ...varKeys];
  const rows = leads.map((l) => [
    l.agentName,
    STAGE_LABEL[l.leadStage] ?? l.leadStage,
    new Date(l.createdAt).toLocaleString("pt-BR"),
    ...varKeys.map((k) => String(l.variables?.[k] ?? "")),
  ]);
  const csv = [header, ...rows].map((r) => r.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function LeadCard({ lead, onOpen, onDragStart }: { lead: Lead; onOpen: () => void; onDragStart: (e: React.DragEvent) => void }) {
  const email = leadEmail(lead);
  const phone = leadPhone(lead);
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onOpen}
      className="flex cursor-grab flex-col gap-1.5 rounded-2xl border border-border-default bg-surface-2 p-3 transition-colors hover:border-border-strong active:cursor-grabbing"
    >
      <p className="truncate text-[13px] font-medium text-text-primary">{leadName(lead)}</p>
      {email && (
        <p className="flex items-center gap-1.5 truncate text-[11.5px] text-text-tertiary">
          <Mail size={11} /> {email}
        </p>
      )}
      {phone && (
        <p className="flex items-center gap-1.5 truncate text-[11.5px] text-text-tertiary">
          <Phone size={11} /> {phone}
        </p>
      )}
      {lead.lastMessage && <p className="truncate text-[12px] text-text-secondary">{lead.lastMessage.text}</p>}
      <p className="text-[10.5px] text-text-tertiary">{lead.agentName} · {formatRelativeDate(lead.updatedAt)}</p>
    </div>
  );
}

function LeadDetail({ lead, onClose, onStageChange, onDelete }: { lead: Lead; onClose: () => void; onStageChange: (stage: string) => void; onDelete: () => void }) {
  const [messages, setMessages] = React.useState<Message[]>([]);

  React.useEffect(() => {
    fetch(`/api/conversations/${lead.id}/messages`)
      .then((res) => res.json())
      .then((data) => setMessages(data.messages ?? []));
  }, [lead.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="glass-card glass-card-solid flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle p-4">
          <div>
            <p className="text-[14px] font-medium text-text-primary">{leadName(lead)}</p>
            <p className="text-[11.5px] text-text-tertiary">{lead.agentName} · {formatRelativeDate(lead.createdAt)}</p>
          </div>
          <div className="flex items-center gap-1.5">
            {STAGES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onStageChange(s)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors",
                  lead.leadStage === s ? "border-border-strong bg-surface-3 text-text-primary" : "border-border-default text-text-tertiary hover:text-text-primary"
                )}
              >
                {STAGE_LABEL[s]}
              </button>
            ))}
            <button
              type="button"
              onClick={onDelete}
              title="Excluir lead"
              className="ml-1 rounded-lg p-1 text-text-tertiary hover:bg-surface-3 hover:text-danger"
            >
              <Trash2 size={15} />
            </button>
            <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary">
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[220px] shrink-0 overflow-y-auto border-r border-border-subtle p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Dados capturados</p>
            {Object.keys(lead.variables ?? {}).filter((k) => !k.startsWith("__")).length === 0 ? (
              <p className="text-[12px] text-text-tertiary">Nenhum dado capturado ainda.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {Object.entries(lead.variables ?? {})
                  .filter(([key]) => !key.startsWith("__"))
                  .map(([key, value]) => (
                    <div key={key}>
                      <p className="text-[10.5px] uppercase tracking-wide text-text-tertiary">{key}</p>
                      <p className="text-[13px] text-text-primary">{String(value)}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex flex-col gap-3">
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.role === "contact" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed",
                      m.role === "contact" ? "bg-accent-500 text-white" : "border border-border-subtle bg-surface-2 text-text-primary"
                    )}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface FieldRow {
  id: string;
  key: string;
  value: string;
}

const DEFAULT_FIELDS = ["nome", "email", "telefone", "interesse"];

function NewLeadModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { agents, isLoaded, load } = useAgentsStore();
  const [agentId, setAgentId] = React.useState("");
  const [stage, setStage] = React.useState<(typeof STAGES)[number]>("novo");
  const [fields, setFields] = React.useState<FieldRow[]>(DEFAULT_FIELDS.map((key) => ({ id: generateId(), key, value: "" })));
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isLoaded) load();
  }, [isLoaded, load]);

  React.useEffect(() => {
    if (!agentId && agents.length > 0) setAgentId(agents[0].id);
  }, [agentId, agents]);

  function updateField(id: string, patch: Partial<FieldRow>) {
    setFields((prev) => prev.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  }

  async function handleSubmit() {
    if (!agentId) {
      setError("Escolha um agente.");
      return;
    }
    const variables: Record<string, string> = {};
    fields.forEach((f) => {
      if (f.key.trim()) variables[f.key.trim()] = f.value;
    });
    if (Object.keys(variables).length === 0) {
      setError("Preencha pelo menos um dado.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, variables, leadStage: stage }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro inesperado.");
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="glass-card glass-card-solid flex w-full max-w-md flex-col gap-4 rounded-3xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-semibold text-text-primary">Novo lead</p>
          <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <X size={16} />
          </button>
        </div>

        <div>
          <Label htmlFor="lead-agent">Agente</Label>
          <Select id="lead-agent" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <Label className="mb-0">Dados do lead</Label>
            <button
              type="button"
              onClick={() => setFields((prev) => [...prev, { id: generateId(), key: "", value: "" }])}
              className="flex items-center gap-1 text-[11.5px] font-medium text-accent-400 hover:text-accent-500"
            >
              <Plus size={12} /> Adicionar campo
            </button>
          </div>
          <div className="flex flex-col gap-1.5">
            {fields.map((f) => (
              <div key={f.id} className="flex items-center gap-1.5">
                <Input value={f.key} onChange={(e) => updateField(f.id, { key: e.target.value })} placeholder="campo" className="w-[110px] shrink-0" />
                <Input value={f.value} onChange={(e) => updateField(f.id, { value: e.target.value })} placeholder="valor" />
                <button
                  type="button"
                  onClick={() => setFields((prev) => prev.filter((x) => x.id !== f.id))}
                  className="shrink-0 rounded-lg p-2 text-text-tertiary hover:bg-surface-3 hover:text-danger"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <Label htmlFor="lead-stage">Estágio</Label>
          <Select id="lead-stage" value={stage} onChange={(e) => setStage(e.target.value as (typeof STAGES)[number])}>
            {STAGES.map((s) => (
              <option key={s} value={s}>{STAGE_LABEL[s]}</option>
            ))}
          </Select>
        </div>

        {error && <p className="text-[12.5px] text-danger">{error}</p>}

        <Button type="button" onClick={handleSubmit} disabled={isSaving}>
          {isSaving ? "Salvando..." : "Adicionar lead"}
        </Button>
      </div>
    </div>
  );
}

function ApiInfoModal({ stage, onClose }: { stage?: (typeof STAGES)[number]; onClose: () => void }) {
  const [origin, setOrigin] = React.useState("");
  React.useEffect(() => setOrigin(window.location.origin), []);

  const effectiveStage = stage ?? "novo";
  const snippet = `curl -X POST ${origin}/api/leads \\
  -H "Content-Type: application/json" \\
  -H "X-Internal-Secret: SEU_INTERNAL_API_SECRET" \\
  -d '{
    "agentId": "ID_DO_AGENTE",
    "variables": { "nome": "...", "email": "...", "telefone": "..." },
    "leadStage": "${effectiveStage}"
  }'`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <div className="glass-card glass-card-solid flex w-full max-w-lg flex-col gap-3 rounded-3xl p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-[15px] font-semibold text-text-primary">
            Adicionar lead via API {stage && <span className="text-text-tertiary">— direto em &quot;{STAGE_LABEL[stage]}&quot;</span>}
          </p>
          <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <X size={16} />
          </button>
        </div>
        <p className="text-[12.5px] text-text-secondary">
          Pra mandar lead de um n8n, formulário externo, etc. — mesmo <code className="font-mono">INTERNAL_API_SECRET</code> que
          já está no seu <code className="font-mono">.env.local</code>. <code className="font-mono">variables</code> aceita
          qualquer campo, não só os do exemplo. Cada etapa do funil tem seu próprio valor de{" "}
          <code className="font-mono">leadStage</code> — clique no ícone <code className="font-mono">{"</>"}</code> de outra
          coluna do Kanban pra pegar o exemplo já configurado pra ela.
        </p>
        <div className="grid grid-cols-5 gap-1.5">
          {STAGES.map((s) => (
            <span
              key={s}
              className={cn(
                "truncate rounded-lg px-1.5 py-1 text-center font-mono text-[10.5px]",
                s === effectiveStage ? "bg-accent-soft text-accent-400" : "bg-surface-3 text-text-tertiary"
              )}
            >
              {s}
            </span>
          ))}
        </div>
        <pre className="overflow-x-auto rounded-xl border border-border-default bg-surface-3 p-3 font-mono text-[11.5px] leading-relaxed text-text-secondary">
          {snippet}
        </pre>
      </div>
    </div>
  );
}

export default function LeadsPage() {
  const [leads, setLeads] = React.useState<Lead[] | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [dragOverStage, setDragOverStage] = React.useState<string | null>(null);
  const [showNewLead, setShowNewLead] = React.useState(false);
  const [apiInfoStage, setApiInfoStage] = React.useState<(typeof STAGES)[number] | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/leads");
    const data = await res.json();
    setLeads(data.leads ?? []);
  }, []);

  React.useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleStageChange(id: string, leadStage: string) {
    setLeads((prev) => (prev ?? []).map((l) => (l.id === id ? { ...l, leadStage } : l)));
    await fetch(`/api/leads/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadStage }),
    });
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Excluir esse lead? Essa ação não pode ser desfeita.")) return;
    setLeads((prev) => (prev ?? []).filter((l) => l.id !== id));
    setOpenId(null);
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
  }

  if (leads === null) return <div className="flex-1 p-8" />;

  const filtered = search.trim()
    ? leads.filter((l) => `${leadName(l)} ${JSON.stringify(l.variables)}`.toLowerCase().includes(search.trim().toLowerCase()))
    : leads;

  const opened = leads.find((l) => l.id === openId) ?? null;

  return (
    <div className="flex flex-1 flex-col p-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Leads</h1>
          <p className="mt-1 text-[13px] text-text-secondary">Contatos capturados pelo widget de chat do seu site — arraste entre colunas pra mudar o estágio.</p>
        </div>
        <div className="flex items-center gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="w-[200px]" />
          <Button type="button" variant="secondary" size="sm" onClick={() => setApiInfoStage("novo")}>
            <Code2 size={14} /> Via API
          </Button>
          <Button type="button" variant="secondary" size="sm" onClick={() => exportCsv(filtered)}>
            <Download size={14} /> Exportar CSV
          </Button>
          <Button type="button" size="sm" onClick={() => setShowNewLead(true)}>
            <Plus size={14} /> Novo lead
          </Button>
        </div>
      </div>

      <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
        {STAGES.map((stage) => {
          const stageLeads = filtered.filter((l) => (l.leadStage || "novo") === stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverStage(stage);
              }}
              onDragLeave={() => setDragOverStage((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                setDragOverStage(null);
                const id = e.dataTransfer.getData("text/plain");
                if (id) handleStageChange(id, stage);
              }}
              className={cn(
                "glass-card flex w-[264px] shrink-0 flex-col rounded-3xl p-3 transition-colors",
                dragOverStage === stage && "ring-2 ring-accent-500/50"
              )}
            >
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className={cn("h-2 w-2 rounded-full", STAGE_DOT[stage])} />
                <p className="text-[12.5px] font-semibold text-text-primary">{STAGE_LABEL[stage]}</p>
                <button
                  type="button"
                  onClick={() => setApiInfoStage(stage)}
                  title={`Criar via API direto em "${STAGE_LABEL[stage]}"`}
                  className="rounded p-0.5 text-text-tertiary hover:text-accent-400"
                >
                  <Code2 size={12} />
                </button>
                <Badge variant="neutral" className="ml-auto">{stageLeads.length}</Badge>
              </div>
              <div className="flex flex-1 flex-col gap-2 overflow-y-auto">
                {stageLeads.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border-default p-4 text-center text-[11.5px] text-text-tertiary">
                    Nenhum lead aqui ainda.
                  </p>
                ) : (
                  stageLeads.map((lead) => (
                    <LeadCard
                      key={lead.id}
                      lead={lead}
                      onOpen={() => setOpenId(lead.id)}
                      onDragStart={(e) => e.dataTransfer.setData("text/plain", lead.id)}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {opened && (
        <LeadDetail
          lead={opened}
          onClose={() => setOpenId(null)}
          onStageChange={(stage) => handleStageChange(opened.id, stage)}
          onDelete={() => handleDelete(opened.id)}
        />
      )}

      {showNewLead && <NewLeadModal onClose={() => setShowNewLead(false)} onCreated={load} />}
      {apiInfoStage && <ApiInfoModal stage={apiInfoStage} onClose={() => setApiInfoStage(null)} />}
    </div>
  );
}
