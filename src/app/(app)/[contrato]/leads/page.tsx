"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import {
  Download, X, Plus, Trash2, Code2, MessageCircle, MoreHorizontal, Zap, ChevronDown, ChevronRight,
  ListFilter, SquareKanban,
} from "lucide-react";
import { DndContext, DragOverlay, useDraggable, useDroppable, PointerSensor, useSensor, useSensors, type DragEndEvent, type DragStartEvent, type DragOverEvent } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { AnimatePresence, motion } from "framer-motion";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Checkbox } from "@/components/ui/checkbox";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { BulkActionBar } from "@/components/ui/bulk-action-bar";
import { PhoneNumber } from "@/components/ui/phone-number";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuCheckboxItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import type { CategoryColor } from "@/lib/design-system/tokens";
import { AvatarDoContato } from "@/components/inbox/avatar";
import { iniciais, horaDaMensagem } from "@/components/inbox/tipos";
import { formatarTelefone } from "@/lib/telefone";
import { pulsar, avisarNaIlha } from "@/lib/fundo/eventos";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { ConversasDoPipe } from "@/components/leads/conversas-do-pipe";
import { cn, formatRelativeDate, generateId } from "@/lib/utils";

// Mesmo formato do LeadDto de src/lib/server/leads.ts (copiado: não dá pra
// importar código de servidor aqui). Lead = contato com etapa, de qualquer canal.
interface Lead {
  id: string;
  name: string;
  email: string;
  phone: string;
  stage: string;
  agentId: string | null;
  agentName: string | null;
  channel: string | null;
  externalId: string | null;
  conversationChannel: string | null;
  conversationId: string | null;
  fields: Record<string, unknown>;
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

// Cor da etapa: é dado (onde o lead está no funil), então ganha cor. Só no
// ponto do cabeçalho e no seletor de etapa do detalhe, nunca no cartão.
const STAGE_COLOR: Record<string, CategoryColor> = {
  novo: "slate",
  contatado: "blue",
  qualificado: "violet",
  ganho: "green",
  perdido: "red",
};

// Quantos cartões cada coluna mostra antes do "Mais N". A API manda tudo; é
// só para a coluna Novo (a que enche) não virar uma pilha sem fim.
const LIMITE_DA_COLUNA = 8;

// Tempo que o "Desfazer" fica na ilha antes de o lead sair de verdade.
const ESPERA_PARA_REMOVER = 5000;

function pick(vars: Record<string, unknown>, candidates: string[]): string | null {
  for (const key of candidates) {
    const value = vars?.[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

function nomeInformado(lead: Lead): string | null {
  return lead.name || pick(lead.fields, ["nome", "nome_cliente", "name", "nome_completo"]);
}
function leadEmail(lead: Lead): string | null {
  return lead.email || pick(lead.fields, ["email", "e-mail", "email_cliente"]);
}
function leadPhone(lead: Lead): string | null {
  return lead.phone || pick(lead.fields, ["telefone", "telefone_cliente", "phone", "whatsapp"]);
}
// Sem nome, o telefone formatado diz mais que "Sem nome" (é como a pessoa
// aparece no WhatsApp de quem atende).
function leadName(lead: Lead): string {
  return nomeInformado(lead) || formatarTelefone(leadPhone(lead))?.texto || "Sem nome";
}
function capturedVarCount(lead: Lead): number {
  return Object.keys(lead.fields ?? {}).filter((k) => !k.startsWith("__")).length;
}

// Origem = canal em que o lead entrou (leadChannel, ou o canal da última
// conversa). No canal "website" o prefixo do id externo separa o chat do
// site ("site-"/"web_") do formulário ("landing_").
type LeadSource = "chat" | "form" | "manual" | "whatsapp" | "instagram" | "messenger" | "telegram" | "outro";
function leadSource(lead: Lead): LeadSource {
  const ext = lead.externalId ?? "";
  switch (lead.channel) {
    case "website":
      if (ext.startsWith("site-") || ext.startsWith("web_")) return "chat";
      if (ext.startsWith("landing_")) return "form";
      return "manual";
    case "api":
    case "manual":
      return "manual";
    case "whatsapp_meta":
    case "whatsapp_qr":
      return "whatsapp";
    case "instagram":
    case "messenger":
    case "telegram":
      return lead.channel;
    default:
      return "outro";
  }
}
const SOURCE_LABEL: Record<LeadSource, string> = {
  chat: "Chat do site",
  form: "Formulário",
  manual: "Manual / API",
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  messenger: "Messenger",
  telegram: "Telegram",
  outro: "Outro canal",
};

function exportCsv(leads: Lead[]) {
  const varKeys = Array.from(new Set(leads.flatMap((l) => Object.keys(l.fields ?? {})))).filter((k) => !k.startsWith("__"));
  const header = ["Agente", "Origem", "Estágio", "Criado em", ...varKeys];
  const rows = leads.map((l) => [
    l.agentName ?? "",
    SOURCE_LABEL[leadSource(l)],
    STAGE_LABEL[l.stage] ?? l.stage,
    new Date(l.createdAt).toLocaleString("pt-BR"),
    ...varKeys.map((k) => String(l.fields?.[k] ?? "")),
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

// Cartão do quadro: só avatar, nome, tempo e a primeira mensagem. E-mail,
// origem e dados capturados moram no detalhe (LeadDetail).
function LeadCardContent({
  lead, anySelected, selected, onToggleSelect,
}: {
  lead: Lead; anySelected: boolean; selected: boolean; onToggleSelect?: () => void;
}) {
  const name = leadName(lead);
  const selecionavel = !!onToggleSelect;

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Avatar vira checkbox ao passar o mouse (ou com seleção ativa): a
            seleção em massa não ocupa espaço no cartão quando não é usada. */}
        <span className="relative flex h-7 w-7 shrink-0 items-center justify-center">
          <span
            className={cn(
              "transition-opacity",
              selecionavel && "group-hover:opacity-0 group-focus-within:opacity-0",
              selecionavel && (anySelected || selected) && "opacity-0"
            )}
          >
            <AvatarDoContato chave={lead.id} nome={name} tamanho="sm" className="h-7 w-7" />
          </span>
          {selecionavel && (
            <span
              className={cn(
                "absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
                (anySelected || selected) && "opacity-100"
              )}
              onClick={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Checkbox checked={selected} onCheckedChange={() => onToggleSelect?.()} aria-label={`Selecionar ${name}`} />
            </span>
          )}
        </span>
        <p className="min-w-0 flex-1 truncate text-small font-semibold text-text-primary">{name}</p>
        <span className="shrink-0 font-mono text-caption text-text-tertiary">{formatRelativeDate(lead.updatedAt)}</span>
      </div>

      {lead.lastMessage && (
        <p className="line-clamp-2 text-caption text-text-secondary">{semMarcacao(lead.lastMessage.text)}</p>
      )}
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
      data-lead-id={lead.id}
      style={{ transform: transform ? CSS.Translate.toString(transform) : undefined, opacity: isDragging ? 0.35 : 1 }}
      onClick={onOpen}
      className={cn(
        "group flex cursor-grab flex-col gap-2 rounded-[14px] border bg-panel p-3 transition-colors active:cursor-grabbing",
        selected ? "border-accent-solid" : "border-border-subtle hover:border-border-default"
      )}
    >
      <LeadCardContent lead={lead} selected={selected} anySelected={anySelected} onToggleSelect={onToggleSelect} />
    </div>
  );
}

function DroppableColumn({ stage, isOver, children }: { stage: string; isOver: boolean; children: React.ReactNode }) {
  const { setNodeRef } = useDroppable({ id: stage });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[272px] shrink-0 flex-col rounded-2xl bg-raised/50 p-2 transition-shadow",
        isOver && "ring-1 ring-border-strong"
      )}
    >
      {children}
    </div>
  );
}

function LeadExecutions({ agentId, channel, externalId }: { agentId: string; channel: string; externalId: string }) {
  const [executions, setExecutions] = React.useState<FlowExecutionRow[] | null>(null);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    // Mesmo formato que o motor grava em flowExecution.conversationId.
    const conversationId = `${channel}:${externalId}`;
    fetch(`/api/agents/${agentId}/executions?conversationId=${encodeURIComponent(conversationId)}&limit=5`)
      .then((res) => res.json())
      .then((data) => setExecutions(data.executions ?? []))
      .catch(() => setExecutions([]));
  }, [agentId, channel, externalId]);

  if (!executions || executions.length === 0) return null;

  return (
    <div className="mt-5">
      <p className="mb-2 flex items-center gap-1.5 font-mono text-caption text-text-tertiary">
        <Zap size={12} /> O que a Eva fez nessa conversa
      </p>
      <div className="flex flex-col border-t border-border-subtle">
        {executions.map((exec) => {
          const expanded = expandedId === exec.id;
          return (
            <div key={exec.id} className="border-b border-border-subtle">
              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : exec.id)}
                className="flex w-full items-center gap-2 py-2 text-left"
              >
                {expanded ? <ChevronDown size={12} className="shrink-0 text-text-tertiary" /> : <ChevronRight size={12} className="shrink-0 text-text-tertiary" />}
                <span className={cn("text-caption font-medium", exec.status === "success" ? "text-success" : "text-danger")}>
                  {exec.status === "success" ? "Sucesso" : "Erro"}
                </span>
                <span className="font-mono text-caption text-text-tertiary">
                  {exec.steps.length} passo{exec.steps.length === 1 ? "" : "s"}
                </span>
                <span className="ml-auto shrink-0 font-mono text-caption text-text-tertiary">{formatRelativeDate(exec.createdAt)}</span>
              </button>
              {expanded && (
                <div className="flex flex-col gap-1.5 pb-2.5 pl-5">
                  {exec.steps.map((step, i) => (
                    <div key={`${step.nodeId}-${i}`} className="text-caption">
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-text-secondary">{step.label}</span>
                        <span className="font-mono text-text-tertiary">{step.ms}ms</span>
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

// Par rótulo/valor da coluna de dados do detalhe.
function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-caption text-text-tertiary">{rotulo}</p>
      <div className="truncate text-small text-text-primary">{children}</div>
    </div>
  );
}

function LeadDetail({ lead, onClose, onStageChange, onDelete }: { lead: Lead; onClose: () => void; onStageChange: (stage: string) => void; onDelete: () => void }) {
  const [messages, setMessages] = React.useState<Message[]>([]);
  const name = leadName(lead);
  const email = leadEmail(lead);
  const phone = leadPhone(lead);
  const varCount = capturedVarCount(lead);
  const conversationId = lead.conversationId;

  React.useEffect(() => {
    if (!conversationId) return;
    fetch(`/api/conversations/${conversationId}/messages`)
      .then((res) => (res.ok ? res.json() : { messages: [] }))
      .then((data) => setMessages(data.messages ?? []))
      .catch(() => setMessages([]));
  }, [conversationId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-6" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="flex h-[80vh] w-full max-w-3xl flex-col overflow-hidden rounded-[18px] border border-border-subtle bg-overlay shadow-overlay"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3">
          <AvatarDoContato chave={lead.id} nome={name} tamanho="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body font-semibold text-text-primary">{name}</p>
            <p className="truncate text-caption text-text-tertiary">
              {lead.agentName ? `${lead.agentName} · ` : ""}lead {formatRelativeDate(lead.createdAt)} ·{" "}
              <Link href={`/contatos?abrir=${lead.id}`} className="text-accent-fg hover:underline">
                Abrir ficha
              </Link>
            </p>
          </div>
          <IconButton aria-label="Remover dos leads (o contato continua em Contatos)" tooltip onClick={onDelete} className="hover:text-danger">
            <Trash2 />
          </IconButton>
          <IconButton aria-label="Fechar" onClick={onClose}>
            <X />
          </IconButton>
        </div>
        <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-2.5">
          <span className="font-mono text-caption text-text-tertiary">Etapa</span>
          <SegmentedControl
            label="Etapa do lead"
            value={(lead.stage || "novo") as (typeof STAGES)[number]}
            onChange={(s) => { if (s !== (lead.stage || "novo")) onStageChange(s); }}
            options={STAGES.map((s) => ({
              value: s,
              label: STAGE_LABEL[s],
              icon: <span aria-hidden="true" className={cn("h-1.5 w-1.5 rounded-full", CATEGORY_CLASSES[STAGE_COLOR[s]].solid)} />,
            }))}
          />
        </div>
        <div className="flex flex-1 overflow-hidden">
          <div className="w-[260px] shrink-0 overflow-y-auto border-r border-border-subtle p-4">
            <div className="flex flex-col gap-3">
              <Dado rotulo="E-mail">{email || <span className="text-text-tertiary">—</span>}</Dado>
              <Dado rotulo="Telefone"><PhoneNumber value={phone} /></Dado>
              <Dado rotulo="Origem">{SOURCE_LABEL[leadSource(lead)]}</Dado>
            </div>

            <p className="mb-2 mt-5 font-mono text-caption text-text-tertiary">
              Dados capturados{varCount > 0 ? ` · ${varCount}` : ""}
            </p>
            {varCount === 0 ? (
              <p className="text-caption text-text-tertiary">Nenhum dado capturado ainda.</p>
            ) : (
              <div className="flex flex-col gap-2.5">
                {Object.entries(lead.fields ?? {})
                  .filter(([key]) => !key.startsWith("__"))
                  .map(([key, value]) => (
                    <Dado key={key} rotulo={key}>{String(value)}</Dado>
                  ))}
              </div>
            )}
            {lead.agentId && lead.conversationChannel && lead.externalId && (
              <LeadExecutions agentId={lead.agentId} channel={lead.conversationChannel} externalId={lead.externalId} />
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {!conversationId && (
              <p className="text-small text-text-tertiary">Sem conversa: lead criado pela tela ou pela API.</p>
            )}
            {/* Mesmas bolhas da Caixa de entrada: cliente à esquerda, agente à direita. */}
            <div className="flex flex-col gap-1.5">
              {messages.map((m) => {
                const doContato = m.role === "contact";
                return (
                  <div
                    key={m.id}
                    className={cn(
                      "max-w-[78%] rounded-[18px] px-3.5 py-2",
                      doContato
                        ? "self-start rounded-bl-md border border-border-subtle bg-raised text-text-primary"
                        : "self-end rounded-br-md bg-accent-solid text-text-on-accent"
                    )}
                  >
                    <p className="whitespace-pre-wrap break-words text-body leading-relaxed">{m.text}</p>
                    <p className={cn("mt-0.5 text-right font-mono text-caption tabular-nums", doContato ? "text-text-tertiary" : "text-text-on-accent/70")}>
                      {horaDaMensagem(m.createdAt)}
                    </p>
                  </div>
                );
              })}
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
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});

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
    const dados: Record<string, string> = {};
    fields.forEach((f) => {
      if (f.key.trim()) dados[f.key.trim()] = f.value;
    });
    if (Object.keys(dados).length === 0) {
      setError("Preencha pelo menos um dado.");
      return;
    }
    setIsSaving(true);
    setError(null);
    setFieldErrors({});
    try {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, fields: dados, stage }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fieldErrors) setFieldErrors(data.fieldErrors);
        throw new Error(data.error ?? "Erro inesperado.");
      }
      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-6" onClick={onClose}>
      <div className="flex w-full max-w-md flex-col gap-4 rounded-[18px] border border-border-subtle bg-overlay p-5 shadow-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-title-sm text-text-primary">Novo lead</p>
          <IconButton aria-label="Fechar" size="sm" onClick={onClose}>
            <X />
          </IconButton>
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
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setFields((prev) => [...prev, { id: generateId(), key: "", value: "" }])}
            >
              <Plus size={13} /> Adicionar campo
            </Button>
          </div>
          <div className="flex flex-col gap-1.5">
            {fields.map((f) => {
              const fieldError = fieldErrors[f.key.trim()];
              return (
                <div key={f.id}>
                  <div className="flex items-center gap-1.5">
                    <Input value={f.key} onChange={(e) => updateField(f.id, { key: e.target.value })} placeholder="campo" className="w-[110px] shrink-0" />
                    <Input
                      value={f.value}
                      onChange={(e) => updateField(f.id, { value: e.target.value })}
                      placeholder="valor"
                      aria-invalid={fieldError ? true : undefined}
                      className={cn(fieldError && "border-danger")}
                    />
                    <IconButton
                      aria-label="Tirar campo"
                      size="sm"
                      onClick={() => setFields((prev) => prev.filter((x) => x.id !== f.id))}
                      className="shrink-0 hover:text-danger"
                    >
                      <Trash2 />
                    </IconButton>
                  </div>
                  {fieldError && <p className="mt-0.5 pl-[116px] text-caption text-danger">{fieldError}</p>}
                </div>
              );
            })}
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

        {error && <p className="text-small text-danger">{error}</p>}

        <Button type="button" onClick={handleSubmit} disabled={isSaving}>
          {isSaving ? "Salvando..." : "Adicionar lead"}
        </Button>
      </div>
    </div>
  );
}

// O exemplo de cada etapa (que antes ficava no ícone </> de cada coluna)
// agora é escolhido aqui dentro: o quadro fica sem ícone por coluna.
function ApiInfoModal({ stage, onClose }: { stage?: (typeof STAGES)[number]; onClose: () => void }) {
  const [origin, setOrigin] = React.useState("");
  const [effectiveStage, setEffectiveStage] = React.useState<(typeof STAGES)[number]>(stage ?? "novo");
  React.useEffect(() => setOrigin(window.location.origin), []);

  const snippet = `curl -X POST ${origin}/api/leads \\
  -H "Content-Type: application/json" \\
  -H "X-Internal-Secret: SEU_INTERNAL_API_SECRET" \\
  -d '{
    "agentId": "ID_DO_AGENTE",
    "fields": { "nome": "...", "email": "...", "telefone": "..." },
    "stage": "${effectiveStage}"
  }'`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-backdrop p-6" onClick={onClose}>
      <div className="flex w-full max-w-lg flex-col gap-3 rounded-[18px] border border-border-subtle bg-overlay p-5 shadow-overlay" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-title-sm text-text-primary">Adicionar lead via API</p>
          <IconButton aria-label="Fechar" size="sm" onClick={onClose}>
            <X />
          </IconButton>
        </div>
        <p className="text-small text-text-secondary">
          Pra mandar lead de um n8n, formulário externo, etc., use o mesmo <code className="font-mono">INTERNAL_API_SECRET</code> que
          já está no seu <code className="font-mono">.env.local</code>. <code className="font-mono">fields</code> aceita
          qualquer campo, não só os do exemplo: nome, e-mail e telefone são validados e vão para a ficha do contato
          (mesmo e-mail ou telefone atualiza o contato existente em vez de duplicar); o resto vira campo livre. Cada etapa
          do funil tem seu próprio valor de <code className="font-mono">stage</code>: escolha abaixo para ver o exemplo
          já configurado para ela.
        </p>
        <SegmentedControl
          label="Etapa do exemplo"
          value={effectiveStage}
          onChange={setEffectiveStage}
          className="self-start"
          options={STAGES.map((s) => ({ value: s, label: STAGE_LABEL[s] }))}
        />
        <pre className="overflow-x-auto rounded-[10px] border border-border-subtle bg-raised p-3 font-mono text-caption leading-relaxed text-text-secondary">
          {snippet}
        </pre>
      </div>
    </div>
  );
}

// Pipe = o site de onde vêm os leads e as conversas (um agente por site: o
// widget da Eva Holding, o chat do Drawing Club...). A escolha fica no
// navegador de quem usa.
interface Pipe {
  agentId: string;
  nome: string;
  conversas: number;
}
const CHAVE_DO_PIPE = "eva.leads.pipe";
const CHAVE_DA_ABA = "eva.leads.aba";

function lerPreferencia(chave: string): string | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage.getItem(chave);
  } catch {
    return null;
  }
}
function gravarPreferencia(chave: string, valor: string) {
  try {
    window.localStorage.setItem(chave, valor);
  } catch {
    // sem armazenamento (aba anônima): só não lembra da escolha
  }
}

export default function LeadsPage() {
  const [leads, setLeads] = React.useState<Lead[] | null>(null);
  const [pipes, setPipes] = React.useState<Pipe[]>([]);
  // "" = todos os sites
  const [pipe, setPipeState] = React.useState<string>(() => lerPreferencia(CHAVE_DO_PIPE) ?? "");
  const [aba, setAbaState] = React.useState<"leads" | "conversas">(() => (lerPreferencia(CHAVE_DA_ABA) === "conversas" ? "conversas" : "leads"));
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [activeDragId, setActiveDragId] = React.useState<string | null>(null);
  const [overStage, setOverStage] = React.useState<string | null>(null);
  const [showNewLead, setShowNewLead] = React.useState(false);
  const [apiInfoStage, setApiInfoStage] = React.useState<(typeof STAGES)[number] | null>(null);
  const [sourceFilter, setSourceFilter] = React.useState<LeadSource | "all">("all");
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set());
  const [actionError, setActionError] = React.useState<string | null>(null);
  // Colunas abertas além do limite ("Mais N").
  const [colunasAbertas, setColunasAbertas] = React.useState<Set<string>>(new Set());
  // Leads removidos esperando o "Desfazer" vencer: somem da tela já, mas o
  // DELETE só sai depois. A sondagem de 8s não pode trazê-los de volta.
  const [ocultos, setOcultos] = React.useState<Set<string>>(new Set());
  const remocoesPendentes = React.useRef(new Map<number, string[]>());

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const load = React.useCallback(async () => {
    const [res, resPipes] = await Promise.all([fetch("/api/leads"), fetch("/api/leads/pipes")]);
    const data = await res.json();
    setLeads(data.leads ?? []);
    if (resPipes.ok) setPipes((await resPipes.json()).pipes ?? []);
  }, []);

  function setPipe(v: string) {
    setPipeState(v);
    setSelectedIds(new Set());
    gravarPreferencia(CHAVE_DO_PIPE, v);
  }
  function setAba(v: "leads" | "conversas") {
    setAbaState(v);
    gravarPreferencia(CHAVE_DA_ABA, v);
  }

  React.useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [load]);

  // Saiu da tela (ou fechou a aba) com remoção esperando o Desfazer: manda
  // na hora, com keepalive para a requisição sobreviver à saída.
  React.useEffect(() => {
    const pendentes = remocoesPendentes.current;
    function despachar() {
      pendentes.forEach((ids, timer) => {
        window.clearTimeout(timer);
        ids.forEach((id) => {
          fetch(`/api/leads/${id}`, { method: "DELETE", keepalive: true }).catch(() => {});
        });
      });
      pendentes.clear();
    }
    window.addEventListener("pagehide", despachar);
    return () => {
      window.removeEventListener("pagehide", despachar);
      despachar();
    };
  }, []);

  async function erroDaResposta(res: Response, padrao: string): Promise<string> {
    const data = await res.json().catch(() => null);
    return (data && typeof data.error === "string" && data.error) || padrao;
  }

  // Otimista: muda na hora e desfaz se o servidor recusar.
  async function handleStageChange(id: string, stage: string) {
    const anterior = leads?.find((l) => l.id === id)?.stage;
    setActionError(null);
    setLeads((prev) => (prev ?? []).map((l) => (l.id === id ? { ...l, stage } : l)));
    try {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage }),
      });
      if (!res.ok) throw new Error(await erroDaResposta(res, "Não foi possível mudar a etapa."));
      // A onda sai do cartão já na coluna nova.
      pulsar(document.querySelector(`[data-lead-id="${escaparSeletor(id)}"]`), 1.2);
    } catch (err) {
      if (anterior !== undefined) setLeads((prev) => (prev ?? []).map((l) => (l.id === id ? { ...l, stage: anterior } : l)));
      setActionError(err instanceof Error ? err.message : "Não foi possível mudar a etapa.");
    }
  }

  // Remove N leads da lista (o contato continua em Contatos). Os que o
  // servidor recusar voltam para a tela.
  async function removerDosLeads(ids: string[]) {
    const removidos = (leads ?? []).filter((l) => ids.includes(l.id));
    setActionError(null);
    setLeads((prev) => (prev ?? []).filter((l) => !ids.includes(l.id)));
    setSelectedIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
    if (openId && ids.includes(openId)) setOpenId(null);

    const resultados = await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`/api/leads/${id}`, { method: "DELETE" });
          return res.ok ? null : await erroDaResposta(res, "Não foi possível remover o lead.");
        } catch {
          return "Não foi possível remover o lead.";
        }
      })
    );
    const falhas = removidos.filter((l) => resultados[ids.indexOf(l.id)] !== null);
    if (falhas.length > 0) {
      setLeads((prev) => [...falhas, ...(prev ?? []).filter((l) => !falhas.some((f) => f.id === l.id))]);
      const primeiro = resultados.find((r) => r !== null);
      setActionError(falhas.length === 1 ? primeiro ?? "Não foi possível remover o lead." : `${falhas.length} leads não puderam ser removidos: ${primeiro}`);
    }
  }

  // No lugar do window.confirm: tira da tela na hora e oferece "Desfazer" na
  // ilha. O DELETE só vai quando o Desfazer vence (a API não tem "devolver
  // aos leads"; adiar o envio é o que deixa desfazer sem mudar a API).
  function removerComDesfazer(ids: string[]) {
    if (ids.length === 0) return;
    const primeiro = (leads ?? []).find((l) => l.id === ids[0]);
    setOcultos((prev) => new Set([...prev, ...ids]));
    setSelectedIds((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
    if (openId && ids.includes(openId)) setOpenId(null);

    const reexibir = () => setOcultos((prev) => { const next = new Set(prev); ids.forEach((id) => next.delete(id)); return next; });
    const timer = window.setTimeout(async () => {
      remocoesPendentes.current.delete(timer);
      await removerDosLeads(ids);
      reexibir();
    }, ESPERA_PARA_REMOVER);
    remocoesPendentes.current.set(timer, ids);

    avisarNaIlha({
      titulo: ids.length === 1 ? `${primeiro ? leadName(primeiro) : "Lead"} saiu dos leads` : `${ids.length} leads saíram da lista`,
      detalhe: ids.length === 1 ? "O contato continua em Contatos" : "Os contatos continuam em Contatos",
      avatar: ids.length === 1 ? (primeiro && iniciais(leadName(primeiro))) || undefined : String(ids.length),
      duracao: ESPERA_PARA_REMOVER,
      acao: {
        rotulo: "Desfazer",
        aoClicar: () => {
          if (!remocoesPendentes.current.has(timer)) return;
          window.clearTimeout(timer);
          remocoesPendentes.current.delete(timer);
          reexibir();
        },
      },
    });
  }

  function handleDelete(id: string) {
    removerComDesfazer([id]);
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    removerComDesfazer(Array.from(selectedIds));
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
      if (current && (current.stage || "novo") !== stage) handleStageChange(id, stage);
    }
  }

  function abrirColuna(stage: string) {
    setColunasAbertas((prev) => new Set([...prev, stage]));
  }

  if (leads === null) return <div className="flex-1 p-8" />;

  // Pipe guardado que não existe mais (agente apagado): volta para todos.
  const pipeAtivo = pipes.some((p) => p.agentId === pipe) ? pipe : "";
  const filtrosAtivos = (pipeAtivo ? 1 : 0) + (sourceFilter !== "all" ? 1 : 0);

  const filtered = leads.filter((l) => {
    if (ocultos.has(l.id)) return false;
    if (pipeAtivo && l.agentId !== pipeAtivo) return false;
    if (sourceFilter !== "all" && leadSource(l) !== sourceFilter) return false;
    if (search.trim() && !`${leadName(l)} ${JSON.stringify(l.fields)}`.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  const opened = leads.find((l) => l.id === openId && !ocultos.has(l.id)) ?? null;
  const activeLead = leads.find((l) => l.id === activeDragId) ?? null;
  const anySelected = selectedIds.size > 0;
  const totalDeConversas = pipeAtivo ? pipes.find((p) => p.agentId === pipeAtivo)?.conversas ?? 0 : pipes.reduce((s, p) => s + p.conversas, 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col px-6 pb-4">
      {/* Barra única: título e contagem à esquerda; busca, Filtros, "…" e a
          ação principal à direita. */}
      <div className="flex h-[58px] shrink-0 items-center gap-2.5">
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">Leads</h1>
        <span className="mt-1 font-mono text-caption text-text-tertiary">{filtered.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <SearchInput value={search} onValueChange={setSearch} placeholder="Buscar lead" aria-label="Buscar lead" className="w-[200px]" />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="secondary">
                <ListFilter size={15} className="text-text-secondary" /> Filtros
                {filtrosAtivos > 0 && (
                  <span className="rounded-full bg-accent-solid px-1.5 font-mono text-caption font-semibold leading-[18px] text-text-on-accent">{filtrosAtivos}</span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[240px]">
              {pipes.length > 0 && (
                <>
                  <DropdownMenuLabel>Site</DropdownMenuLabel>
                  <DropdownMenuCheckboxItem checked={pipeAtivo === ""} onSelect={(e) => { e.preventDefault(); setPipe(""); }}>
                    Todos os sites
                  </DropdownMenuCheckboxItem>
                  {pipes.map((p) => (
                    <DropdownMenuCheckboxItem key={p.agentId} checked={pipeAtivo === p.agentId} onSelect={(e) => { e.preventDefault(); setPipe(p.agentId); }}>
                      <span className="truncate">{p.nome}</span>
                    </DropdownMenuCheckboxItem>
                  ))}
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuLabel>Origem</DropdownMenuLabel>
              <DropdownMenuCheckboxItem checked={sourceFilter === "all"} onSelect={(e) => { e.preventDefault(); setSourceFilter("all"); }}>
                Todas as origens
              </DropdownMenuCheckboxItem>
              {(Object.keys(SOURCE_LABEL) as LeadSource[]).map((s) => (
                <DropdownMenuCheckboxItem key={s} checked={sourceFilter === s} onSelect={(e) => { e.preventDefault(); setSourceFilter(s); }}>
                  {SOURCE_LABEL[s]}
                </DropdownMenuCheckboxItem>
              ))}
              {filtrosAtivos > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => { setPipe(""); setSourceFilter("all"); }}>
                    <X /> Limpar filtros
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton variant="secondary" aria-label="Mais ações">
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setApiInfoStage("novo")}>
                <Code2 /> Adicionar via API
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportCsv(filtered)}>
                <Download /> Exportar CSV
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button type="button" onClick={() => setShowNewLead(true)}>
            <Plus size={15} /> Novo lead
          </Button>
        </div>
      </div>

      <div className="flex h-11 shrink-0 items-center">
        <SegmentedControl
          label="Visão dos leads"
          value={aba}
          onChange={setAba}
          className="tabular-nums"
          options={[
            { value: "leads", label: `Quadro ${filtered.length}`, icon: <SquareKanban /> },
            { value: "conversas", label: `Conversas ${totalDeConversas}`, icon: <MessageCircle /> },
          ]}
        />
      </div>

      {actionError && (
        <div role="alert" className="mb-3 flex items-center justify-between gap-3 rounded-[10px] bg-danger-subtle px-3 py-2 text-small text-danger">
          <span>{actionError}</span>
          <IconButton aria-label="Fechar" size="sm" onClick={() => setActionError(null)}>
            <X />
          </IconButton>
        </div>
      )}

      {aba === "conversas" ? (
        <ConversasDoPipe agentId={pipeAtivo || null} />
      ) : (
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragOver={handleDragOver} onDragEnd={handleDragEnd}>
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto pb-2 pt-2">
          {STAGES.map((stage) => {
            const stageLeads = filtered.filter((l) => (l.stage || "novo") === stage);
            const aberta = colunasAbertas.has(stage);
            const visiveis = aberta ? stageLeads : stageLeads.slice(0, LIMITE_DA_COLUNA);
            const escondidos = stageLeads.length - visiveis.length;
            return (
              <DroppableColumn key={stage} stage={stage} isOver={overStage === stage}>
                <div className="flex h-8 shrink-0 items-center gap-2 px-1.5">
                  <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", CATEGORY_CLASSES[STAGE_COLOR[stage]].solid)} />
                  <p className="text-small font-semibold text-text-primary">{STAGE_LABEL[stage]}</p>
                  <span className="font-mono text-caption text-text-tertiary">{stageLeads.length}</span>
                </div>
                <div className="flex flex-1 flex-col gap-2 overflow-y-auto pt-1">
                  <AnimatePresence initial={false}>
                    {stageLeads.length === 0 ? (
                      <p className="rounded-[14px] border border-border-subtle px-3 py-4 text-center text-caption text-text-tertiary">
                        Nenhum lead
                      </p>
                    ) : (
                      visiveis.map((lead) => (
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
                  {escondidos > 0 && (
                    <button
                      type="button"
                      onClick={() => abrirColuna(stage)}
                      className="flex h-8 shrink-0 items-center rounded-[10px] px-2 text-caption text-text-tertiary transition-colors hover:bg-hover hover:text-text-primary"
                    >
                      Mais {escondidos}
                    </button>
                  )}
                </div>
              </DroppableColumn>
            );
          })}
        </div>

        <DragOverlay>
          {activeLead && (
            <div className="flex w-[256px] rotate-2 flex-col gap-2 rounded-[14px] border border-border-default bg-panel p-3 shadow-overlay">
              <LeadCardContent lead={activeLead} selected={false} anySelected={false} />
            </div>
          )}
        </DragOverlay>
      </DndContext>
      )}

      {aba === "leads" && (
        <BulkActionBar count={selectedIds.size} onClear={() => setSelectedIds(new Set())}>
          <Button type="button" variant="ghost" size="sm" onClick={handleBulkDelete} className="text-danger hover:text-danger">
            <Trash2 size={14} /> Remover dos leads
          </Button>
        </BulkActionBar>
      )}

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

// CSS.escape existe em todo navegador atual; o fallback só evita quebrar se
// o id tiver aspas (ids são cuid, então na prática nunca).
function escaparSeletor(v: string): string {
  return typeof window !== "undefined" && window.CSS?.escape ? window.CSS.escape(v) : v.replace(/"/g, '\\"');
}

/** Prévia em texto corrido: tira a marcação de markdown que o agente usa (#, **, _, `). */
function semMarcacao(texto: string): string {
  return texto
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__|\*|_|`)(.+?)\1/g, "$2")
    .replace(/\s+/g, " ")
    .trim();
}
