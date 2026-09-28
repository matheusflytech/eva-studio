"use client";

import * as React from "react";
import {
  Download, X, Mail, Phone, Plus, Trash2, Code2, MessageCircle, Smartphone,
  MoreHorizontal, Zap, ChevronDown, ChevronRight, Inbox,
} from "lucide-react";
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent, type DragOverEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
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

interface FlowStep {
  nodeId: string;
  kind: string;
  label: string;
  output?: string;
  error?: string;
  ms: number;
}

interface FlowExecutionRow {
  id: string;
  status: "success" | "error";
  steps: FlowStep[];
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

// Só um ponto discreto por estágio no cabeçalho da coluna — sem barra de cor
// decorativa (esse padrão de "faixa colorida no topo do card" é exatamente o
// que faz uma tela parecer "gerada", não desenhada). Neutro por padrão,
// destaque reservado só pra Ganho/Perdido, que são os dois estados que
// realmente importa bater o olho e reconhecer.
const STAGE_ACCENT: Record<string, { dot: string; ring: string }> = {
  novo: { dot: "bg-text-tertiary", ring: "ring-border-strong" },
  contatado: { dot: "bg-text-tertiary", ring: "ring-border-strong" },
  qualificado: { dot: "bg-text-tertiary", ring: "ring-border-strong" },
  ganho: { dot: "bg-emerald-400", ring: "ring-emerald-400/40" },
  perdido: { dot: "bg-danger", ring: "ring-danger/40" },
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Avatar monocromático (cinza neutro) — nada de cor por hash do nome. Uma
// tela com "toda pessoa tem uma cor diferente" é bonita numa demo e cansativa
// no uso real; enterprise de verdade (Linear, Stripe) usa uma cor só.
function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center rounded-full bg-surface-3 font-semibold text-text-secondary"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {initials(name)}
    </span>
  );
}

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
function capturedVarCount(lead: Lead): number {
  return Object.keys(lead.variables ?? {}).filter((k) => !k.startsWith("__")).length;
}

// Cada canal de captura usa seu próprio prefixo de contactId (ver
// api/leads/route.ts e os scripts do site) — mais confiável que o nome do
// agente pra diferenciar a origem, já que o agente pode ser renomeado.
type LeadSource = "chat" | "form" | "manual";
function leadSource(lead: Lead): LeadSource {
  if (lead.contactId.startsWith("site-")) return "chat";
  if (lead.contactId.startsWith("landing_")) return "form";
  return "manual";
}
const SOURCE_LABEL: Record<LeadSource, string> = { chat: "Chat do site", form: "Formulário", manual: "Manual / API" };
const SOURCE_ICON: Record<LeadSource, typeof MessageCircle> = { chat: MessageCircle, form: Smartphone, manual: Code2 };

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

function LeadCardContent({
  lead, anySelected, selected, onToggleSelect,
}: {
  lead: Lead; anySelected: boolean; selected: boolean; onToggleSelect?: (e: React.MouseEvent) => void;
}) {
  const email = leadEmail(lead);
  const phone = leadPhone(lead);
  const source = leadSource(lead);
  const SourceIcon = SOURCE_ICON[source];
  const varCount = capturedVarCount(lead);
  const name = leadName(lead);

  return (
    <>
      <div className="flex items-start gap-2.5">
        <Avatar name={name} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-text-primary">{name}</p>
          <p className="text-[10.5px] text-text-tertiary">{formatRelativeDate(lead.updatedAt)}</p>
        </div>
        <span
          onClick={onToggleSelect}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-opacity",
            selected ? "border-accent-500 bg-accent-500 text-white opacity-100" : "border-border-default opacity-0 group-hover:opacity-100",
            anySelected && "opacity-100"
          )}
        >
          {selected && <span className="text-[10px] leading-none">✓</span>}
        </span>
      </div>

      {(email || phone) && (
        <div className="mt-2 flex flex-col gap-1">
          {email && (
            <p className="flex items-center gap-1.5 truncate text-[11px] text-text-tertiary">
              <Mail size={10.5} /> {email}
            </p>
          )}
          {phone && (
            <p className="flex items-center gap-1.5 truncate text-[11px] text-text-tertiary">
              <Phone size={10.5} /> {phone}
            </p>
          )}
        </div>
      )}

      {lead.lastMessage && (
        <p className="mt-2 line-clamp-2 text-[11.5px] leading-snug text-text-secondary">
          {lead.lastMessage.text}
        </p>
      )}

      <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border-subtle pt-2">
        <span className="flex items-center gap-1 text-[10.5px] text-text-tertiary">
          <SourceIcon size={11} /> {SOURCE_LABEL[source]}
        </span>
        {varCount > 0 && (
          <span className="shrink-0 text-[10.5px] text-text-tertiary">
            {varCount} dado{varCount === 1 ? "" : "s"}
          </span>
        )}
      </div>
    </>
  );
}

function DraggableLeadCard({
  lead, onOpen, selected, onToggleSelect, anySelected,
}: {
  lead: Lead; onOpen: () => void; selected: boolean; onToggleSelect: () => void; anySelected: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id, data: { lead } });

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      style={{ transform: transform ? CSS.Translate.toString(transform) : undefined, opacity: isDragging ? 0.35 : 1 }}
      onClick={onOpen}
      className="group flex cursor-grab flex-col rounded-2xl border border-border-default bg-surface-2 p-3 shadow-sm transition-colors hover:border-border-strong hover:shadow-md active:cursor-grabbing"
    >
      <LeadCardContent
        lead={lead}
        selected={selected}
        anySelected={anySelected}
        onToggleSelect={(e) => {
          e.stopPropagation();
          onToggleSelect();
        }}
      />
    </div>
  );
}

function DroppableColumn({ stage, isOver, children }: { stage: string; isOver: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: stage });
  const accent = STAGE_ACCENT[stage];
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "glass-card relative flex w-[272px] shrink-0 flex-col overflow-hidden rounded-3xl p-3 transition-shadow",
        isOver && `ring-2 ${accent.ring}`
      )}
    >
      {children}
    </div>
  );
}

function LeadExecutions({ agentId, contactId }: { agentId: string; contactId: string }) {
  const [executions, setExecutions] = React.useState<FlowExecutionRow[] | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const conversationId = `website:${contactId}`;
    fetch(`/api/agents/${agentId}/executions?conversationId=${encodeURIComponent(conversationId)}&limit=5`)
      .then((res) => res.json())
      .then((data) => setExecutions(data.executions ?? []))
      .catch(() => setExecutions([]));
  }, [agentId, contactId]);

  if (!executions || executions.length === 0) return null;

  return (
    <div className="mt-5">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
        <Zap size={11} /> O que a IA fez nessa conversa
      </p>
      <div className="flex flex-col gap-1.5">
        {executions.map((exec) => {
          const expanded = expandedId === exec.id;
          return (
            <div key={exec.id} className="rounded-xl border border-border-subtle bg-surface-3/60">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : exec.id)}
                className="flex w-full items-center gap-2 px-2.5 py-2 text-left"
              >
                {expanded ? <ChevronDown size={12} className="shrink-0 text-text-tertiary" /> : <ChevronRight size={12} className="shrink-0 text-text-tertiary" />}
                <span className={cn("text-[11px] font-medium", exec.status === "success" ? "text-emerald-400" : "text-danger")}>
                  {exec.status === "success" ? "Sucesso" : "Erro"}
                </span>
                <span className="text-[10.5px] text-text-tertiary">
                  {exec.steps.length} passo{exec.steps.length === 1 ? "" : "s"}
                </span>
                <span className="ml-auto shrink-0 text-[10.5px] text-text-tertiary">{formatRelativeDate(exec.createdAt)}</span>
              </button>
              {expanded && (
                <div className="flex flex-col gap-1.5 border-t border-border-subtle p-2.5">
                  {exec.steps.map((step, i) => (
                    <div key={`${step.nodeId}-${i}`} className="text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-text-secondary">{step.label}</span>
                        <span className="text-text-tertiary">{step.ms}ms</span>
                      </div>
                      {step.output && <p className="truncate text-text-tertiary">{step.output}</p>}
                      {step.error && <p className="truncate text-danger">{step.error}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function LeadDetail({ lead, onClose, onStageChange, onDelete }: { lead: Lead; onClose: () => void; onStageChange: (stage: string) => void; onDelete: () => void }) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const name = leadName(lead);

  React.useEffect(() => {
    fetch(`/api/conversations/${lead.id}/messages`)
      .then((res) => res.json())
      .then((data) => setMessages(data.messages ?? []));
  }, [lead.id]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="glass-card glass-card-solid flex h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-border-subtle p-4">
          <div className="flex items-center gap-3">
            <Avatar name={name} size={38} />
            <div>
              <div className="flex items-center gap-2">
                <p className="text-[14px] font-medium text-text-primary">{name}</p>
                <Badge variant="neutral" className="text-[10px]">
                  {SOURCE_LABEL[leadSource(lead)]}
                </Badge>
              </div>
              <p className="text-[11.5px] text-text-tertiary">{lead.agentName} · {formatRelativeDate(lead.createdAt)}</p>
            </div>
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
          <div className="w-[240px] shrink-0 overflow-y-auto border-r border-border-subtle p-4">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">Dados capturados</p>
            {capturedVarCount(lead) === 0 ? (
              <p className="text-[12px] text-text-tertiary">Nenhum dado capturado ainda.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {Object.entries(lead.variables ?? {})
                  .filter(([key]) => !key.startsWith("__"))
                  .map(([key, value]) => (
                    <div key={key} className="rounded-lg border border-border-subtle bg-surface-2 px-2.5 py-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-text-tertiary">{key}</p>
                      <p className="truncate text-[12.5px] text-text-primary">{String(value)}</p>
                    </div>
                  ))}
              </div>
            )}
            <LeadExecutions agentId={lead.agentId} contactId={lead.contactId} />
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            <div className="flex flex-col gap-3">
              {messages.map((m) => (
                <div key={m.id} className={cn("flex", m.role === "contact" ? "justify-end" : "justify-start")}>
                  <div
                    className={cn(
                      "max-w-[75%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed shadow-sm",
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
      </motion.div>
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
            Adicionar lead via API {stage && <span className="text-text-tertiary">(direto em &quot;{STAGE_LABEL[stage]}&quot;)</span>}
          </p>
          <button type="button" onClick={onClose} className="text-text-tertiary hover:text-text-primary">
            <X size={16} />
          </button>
        </div>
        <p className="text-[12.5px] text-text-secondary">
          Pra mandar lead de um n8n, formulário externo, etc., use o mesmo <code className="font-mono">INTERNAL_API_SECRET</code> que
          já está no seu <code className="font-mono">.env.local</code>. <code className="font-mono">variables</code> aceita
          qualquer campo, não só os do exemplo. Cada etapa do funil tem seu próprio valor de{" "}
          <code className="font-mono">leadStage</code>, clique no ícone <code className="font-mono">{"</>"}</code> de outra
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
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);
  const [overStage, setOverStage] = React.useState<string | null>(null);
  const [showNewLead, setShowNewLead] = React.useState(false);
  const [apiInfoStage, setApiInfoStage] = React.useState<(typeof STAGES)[number] | null>(null);
  const [sourceFilter, setSourceFilter] = React.useState<LeadSource | "all">("all");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

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
    setSelectedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    await fetch(`/api/leads/${id}`, { method: "DELETE" });
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Excluir ${selectedIds.size} lead(s) selecionado(s)? Essa ação não pode ser desfeita.`)) return;
    const ids = Array.from(selectedIds);
    setLeads((prev) => (prev ?? []).filter((l) => !selectedIds.has(l.id)));
    setSelectedIds(new Set());
    await Promise.all(ids.map((id) => fetch(`/api/leads/${id}`, { method: "DELETE" })));
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    setOverStage(event.over ? String(event.over.id) : null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const id = String(event.active.id);
    const stage = event.over ? String(event.over.id) : null;
    setActiveDragId(null);
    setOverStage(null);
    if (stage && STAGES.includes(stage as (typeof STAGES)[number])) {
      const current = leads?.find((l) => l.id === id);
      if (current && (current.leadStage || "novo") !== stage) handleStageChange(id, stage);
    }
  }

  if (leads === null) return <div className="flex-1 p-8" />;

  const filtered = leads.filter((l) => {
    if (sourceFilter !== "all" && leadSource(l) !== sourceFilter) return false;
    if (search.trim() && !`${leadName(l)} ${JSON.stringify(l.variables)}`.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const opened = leads.find((l) => l.id === openId) ?? null;
  const activeLead = leads.find((l) => l.id === activeDragId) ?? null;
  const anySelected = selectedIds.size > 0;

  return (
    <div className="flex flex-1 flex-col p-8">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-semibold text-text-primary">Leads</h1>
          <p className="mt-1 text-[13px] text-text-secondary">Contatos capturados pelo chat e pelo formulário do seu site. Arraste entre colunas pra mudar o estágio.</p>
        </div>
        <div className="flex items-center gap-2">
          {anySelected && (
            <Button type="button" variant="danger" size="sm" onClick={handleBulkDelete}>
              <Trash2 size={14} /> Excluir {selectedIds.size} selecionado{selectedIds.size > 1 ? "s" : ""}
            </Button>
          )}
          <Select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value as LeadSource | "all")} className="w-[150px]">
            <option value="all">Todas as origens</option>
            <option value="chat">{SOURCE_LABEL.chat}</option>
            <option value="form">{SOURCE_LABEL.form}</option>
            <option value="manual">{SOURCE_LABEL.manual}</option>
          </Select>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar..." className="w-[200px]" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" title="Mais ações">
                <MoreHorizontal size={16} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setApiInfoStage("novo")}>
                <Code2 size={14} /> Adicionar via API
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportCsv(filtered)}>
                <Download size={14} /> Exportar CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" size="sm" onClick={() => setShowNewLead(true)}>
            <Plus size={14} /> Novo lead
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div className="flex flex-1 gap-4 overflow-x-auto pb-2">
          {STAGES.map((stage) => {
            const stageLeads = filtered.filter((l) => (l.leadStage || "novo") === stage);
            const accent = STAGE_ACCENT[stage];
            return (
              <DroppableColumn key={stage} stage={stage} isOver={overStage === stage}>
                <div className="mb-2 flex items-center gap-2 px-1">
                  <span className={cn("h-2 w-2 rounded-full", accent.dot)} />
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
                  <AnimatePresence initial={false}>
                    {stageLeads.length === 0 ? (
                      <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-border-default p-6 text-center">
                        <Inbox size={16} className="text-text-tertiary" />
                        <p className="text-[11.5px] text-text-tertiary">Nenhum lead aqui ainda.</p>
                      </div>
                    ) : (
                      stageLeads.map((lead) => (
                        <motion.div
                          key={lead.id}
                          layout
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.96 }}
                          transition={{ duration: 0.15 }}
                        >
                          <DraggableLeadCard
                            lead={lead}
                            onOpen={() => setOpenId(lead.id)}
                            selected={selectedIds.has(lead.id)}
                            onToggleSelect={() => toggleSelect(lead.id)}
                            anySelected={anySelected}
                          />
                        </motion.div>
                      ))
                    )}
                  </AnimatePresence>
                </div>
              </DroppableColumn>
            );
          })}
        </div>

        <DragOverlay>
          {activeLead && (
            <div className="w-[272px] rotate-2 rounded-2xl border border-border-strong bg-surface-2 p-3 shadow-2xl">
              <LeadCardContent lead={activeLead} selected={false} anySelected={false} />
            </div>
          )}
        </DragOverlay>
      </DndContext>

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
