"use client";

import * as React from "react";
import Link from "next/link";
import { Handshake, Plus, Loader2, X, CheckCircle2, XCircle, Clock, SlidersHorizontal } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalContent } from "@/components/ui/modal";
import { DealDrawer } from "@/components/crm/deal-drawer";
import { cn } from "@/lib/utils";
import { ChipsDeCampos, CamposDoFormulario, rascunhoParaEnvio, type Rascunho } from "@/components/crm/campos-personalizados";
import { corDaEtapa, type DefinicaoDeCampo } from "@/lib/custom-fields";

interface DealCard {
  id: string;
  name: string;
  amountCents: number;
  probability: number;
  company: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  contacts: { id: string; name: string }[];
  openTasks: number;
  expectedClosingAt: string | null;
  closedAt: string | null;
  customFields: Record<string, unknown>;
}

interface StageColumn {
  id: string;
  name: string;
  type: string;
  color: string;
  probability: number;
  totalCents: number;
  weightedCents: number;
  deals: DealCard[];
}

interface PipelineOption {
  id: string;
  name: string;
  stages: { id: string; name: string; type: string }[];
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

// A cor da etapa é escolha do cliente. Sem escolha, só ganho e perdido ganham
// cor e o resto fica neutro.
function stageAccent(type: string, color: string): { dot: string; label?: React.ReactNode } {
  const cor = corDaEtapa(color, type);
  if (type === "won") return { dot: cor.ponto, label: <CheckCircle2 size={12} className={cor.texto} /> };
  if (type === "lost") return { dot: cor.ponto, label: <XCircle size={12} className={cor.texto} /> };
  return { dot: cor.ponto };
}

function DealCardView({ deal, defs, dragging }: { deal: DealCard; defs: DefinicaoDeCampo[]; dragging?: boolean }) {
  return (
    <div
      className={cn(
        "rounded-2xl bg-surface-2 px-3.5 py-3 ring-1 ring-border-subtle transition-shadow",
        dragging && "shadow-2xl"
      )}
    >
      <div className="text-[13.5px] font-medium text-text-primary">{deal.name}</div>
      {deal.company && <div className="mt-0.5 truncate text-[11.5px] text-text-tertiary">{deal.company.name}</div>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {deal.amountCents > 0 && (
          <span className="text-[13px] font-semibold text-text-primary">{money(deal.amountCents)}</span>
        )}
        <Badge>{deal.probability}%</Badge>
        {deal.openTasks > 0 && (
          <span className="inline-flex items-center gap-1 text-[11px] text-text-tertiary">
            <Clock size={11} /> {deal.openTasks}
          </span>
        )}
      </div>
      <ChipsDeCampos defs={defs} valores={deal.customFields} />
      {deal.contacts.length > 0 && (
        <div className="mt-2 truncate text-[11.5px] text-text-tertiary">
          {deal.contacts.map((c) => c.name || "Sem nome").join(", ")}
        </div>
      )}
    </div>
  );
}

function DraggableDeal({ deal, defs, onOpen }: { deal: DealCard; defs: DefinicaoDeCampo[]; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  // Onde o dedo desceu. Sem isso, arrastar um card para outra coluna também
  // abriria o painel no fim do movimento: o dnd-kit deixa o clique passar.
  const origem = React.useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1 }}
      {...listeners}
      {...attributes}
      onPointerDownCapture={(e) => { origem.current = { x: e.clientX, y: e.clientY }; }}
      onClick={(e) => {
        const p = origem.current;
        if (p && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) return;
        onOpen();
      }}
      className="cursor-grab active:cursor-grabbing"
    >
      <DealCardView deal={deal} defs={defs} />
    </div>
  );
}

function StageColumnView({
  stage,
  defs,
  onOpenDeal,
}: {
  stage: StageColumn;
  defs: DefinicaoDeCampo[];
  onOpenDeal: (deal: DealCard) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  const accent = stageAccent(stage.type, stage.color);

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex w-[280px] shrink-0 flex-col rounded-3xl bg-surface-1/60 p-3 ring-1 transition-colors",
        isOver ? "ring-accent-500/40" : "ring-border-subtle"
      )}
    >
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span className={cn("h-1.5 w-1.5 rounded-full", accent.dot)} />
          <span className="text-[13px] font-medium text-text-primary">{stage.name}</span>
          {accent.label}
          <span className="text-[11.5px] text-text-tertiary">{stage.deals.length}</span>
        </div>
      </div>

      <div className="mb-3 px-1">
        <div className="text-[13px] font-semibold text-text-primary">{money(stage.totalCents)}</div>
        {stage.type === "open" && stage.totalCents > 0 && (
          <div className="text-[11px] text-text-tertiary">{money(stage.weightedCents)} ponderado</div>
        )}
      </div>

      <div className="flex flex-col gap-2 overflow-y-auto">
        {stage.deals.map((deal) => (
          <DraggableDeal key={deal.id} deal={deal} defs={defs} onOpen={() => onOpenDeal(deal)} />
        ))}
        {stage.deals.length === 0 && (
          <p className="px-1 py-6 text-center text-[12px] text-text-tertiary">Nenhum negócio aqui.</p>
        )}
      </div>
    </div>
  );
}

export default function NegociosPage() {
  const [pipelines, setPipelines] = React.useState<PipelineOption[]>([]);
  const [pipelineId, setPipelineId] = React.useState("");
  const [stages, setStages] = React.useState<StageColumn[]>([]);
  const [defs, setDefs] = React.useState<DefinicaoDeCampo[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [showNew, setShowNew] = React.useState(false);
  const [openDealId, setOpenDealId] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState<DealCard | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  React.useEffect(() => {
    fetch("/api/pipelines")
      .then((r) => r.json())
      .then((d) => {
        setPipelines(d.pipelines ?? []);
        if (d.pipelines?.[0]) setPipelineId((prev) => prev || d.pipelines[0].id);
      })
      .catch(() => setPipelines([]));
  }, []);

  const refresh = React.useCallback(async () => {
    setIsLoading(true);
    const res = await fetch(`/api/deals${pipelineId ? `?pipeline=${pipelineId}` : ""}`);
    const data = await res.json();
    setStages(data.stages ?? []);
    setDefs(data.fields ?? []);
    setIsLoading(false);
  }, [pipelineId]);

  React.useEffect(() => { refresh(); }, [refresh]);

  const allDeals = React.useMemo(() => stages.flatMap((s) => s.deals), [stages]);

  function handleDragStart(event: DragStartEvent) {
    setDragging(allDeals.find((d) => d.id === event.active.id) ?? null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDragging(null);
    const dealId = String(event.active.id);
    const stageId = event.over ? String(event.over.id) : "";
    if (!stageId) return;

    const from = stages.find((s) => s.deals.some((d) => d.id === dealId));
    if (!from || from.id === stageId) return;

    // Move na tela antes da resposta: arrastar e esperar o servidor pra ver o
    // card mudar de coluna é o que faz kanban parecer lento.
    setStages((prev) =>
      prev.map((s) => {
        if (s.id === from.id) return { ...s, deals: s.deals.filter((d) => d.id !== dealId) };
        if (s.id === stageId) {
          const deal = from.deals.find((d) => d.id === dealId)!;
          return { ...s, deals: [deal, ...s.deals] };
        }
        return s;
      })
    );

    const res = await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    });
    if (!res.ok) setError("Não foi possível mover o negócio.");
    // Recarrega de qualquer forma: os totais por etapa mudaram.
    refresh();
  }

  const totalOpen = stages
    .filter((s) => s.type === "open")
    .reduce((sum, s) => sum + s.weightedCents, 0);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-primary">Negócios</h1>
          <p className="mt-1 text-[15px] text-text-secondary">
            Previsão ponderada em aberto: <span className="font-semibold text-text-primary">{money(totalOpen)}</span>
          </p>
        </div>
        <div className="flex items-end gap-3">
          {pipelines.length > 1 && (
            <div className="w-[200px]">
              <Label htmlFor="pipeline">Funil</Label>
              <Select id="pipeline" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)}>
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
            </div>
          )}
          <Link
            href="/negocios/configurar"
            className="inline-flex h-11 items-center gap-2 rounded-xl border border-border-default bg-surface-2 px-4 text-sm text-text-secondary transition-colors hover:text-text-primary"
          >
            <SlidersHorizontal size={15} /> Personalizar
          </Link>
          <Button onClick={() => setShowNew(true)}>
            <Plus size={15} /> Novo negócio
          </Button>
        </div>
      </header>

      {error && <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}

      {isLoading && stages.length === 0 ? (
        <p className="text-[14px] text-text-tertiary">Carregando...</p>
      ) : stages.length === 0 ? (
        <EmptyState
          icon={<Handshake size={36} className="text-text-tertiary" />}
          title="Nenhum funil configurado"
          description="Um funil padrão é criado sozinho na primeira vez que você abre esta tela."
        />
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex gap-3 overflow-x-auto pb-4">
            {stages.map((stage) => (
              <StageColumnView key={stage.id} stage={stage} defs={defs} onOpenDeal={(d) => setOpenDealId(d.id)} />
            ))}
          </div>
          <DragOverlay>{dragging && <DealCardView deal={dragging} defs={defs} dragging />}</DragOverlay>
        </DndContext>
      )}

      {openDealId && (
        <DealDrawer
          dealId={openDealId}
          onClose={() => setOpenDealId(null)}
          onChanged={refresh}
        />
      )}

      {showNew && (
        <NewDealModal
          pipelines={pipelines}
          pipelineId={pipelineId}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); refresh(); }}
        />
      )}
    </div>
  );
}

function NewDealModal({
  pipelines,
  pipelineId,
  onClose,
  onCreated,
}: {
  pipelines: PipelineOption[];
  pipelineId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = React.useState({ name: "", amount: "", stageId: "", description: "" });
  const [contactQuery, setContactQuery] = React.useState("");
  const [contacts, setContacts] = React.useState<{ id: string; name: string; email: string }[]>([]);
  const [contactId, setContactId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [campos, setCampos] = React.useState<DefinicaoDeCampo[]>([]);
  const [rascunho, setRascunho] = React.useState<Rascunho>({});

  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];

  React.useEffect(() => {
    if (!pipeline?.id) return;
    fetch(`/api/custom-fields?entity=deal&pipelineId=${pipeline.id}`)
      .then((r) => r.json())
      .then((d) => setCampos(d.fields ?? []))
      .catch(() => setCampos([]));
  }, [pipeline?.id]);

  React.useEffect(() => {
    if (contactQuery.trim().length < 2) {
      setContacts([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/contacts?q=${encodeURIComponent(contactQuery)}`)
        .then((r) => r.json())
        .then((d) => setContacts(d.contacts ?? []))
        .catch(() => setContacts([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [contactQuery]);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        pipelineId: pipeline?.id,
        stageId: form.stageId || undefined,
        amount: Number(form.amount.replace(/\./g, "").replace(",", ".")) || 0,
        description: form.description,
        contactId: contactId || undefined,
        customFields: rascunhoParaEnvio(campos, rascunho),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Não foi possível criar o negócio.");
      return;
    }
    onCreated();
  }

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent title="Novo negócio">
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="deal-name">Nome</Label>
            <Input
              id="deal-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Implantação para Acme"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="deal-amount">Valor</Label>
              <Input
                id="deal-amount"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="1500,00"
              />
            </div>
            <div>
              <Label htmlFor="deal-stage">Etapa</Label>
              <Select
                id="deal-stage"
                value={form.stageId}
                onChange={(e) => setForm({ ...form, stageId: e.target.value })}
              >
                <option value="">Primeira etapa</option>
                {(pipeline?.stages ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="deal-contact">Contato</Label>
            <Input
              id="deal-contact"
              value={contactQuery}
              onChange={(e) => { setContactQuery(e.target.value); setContactId(""); }}
              placeholder="Buscar por nome, e-mail ou telefone"
            />
            {contacts.length > 0 && !contactId && (
              <div className="mt-1.5 flex max-h-[140px] flex-col overflow-y-auto rounded-xl bg-surface-2 p-1">
                {contacts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setContactId(c.id); setContactQuery(c.name || c.email); setContacts([]); }}
                    className="rounded-lg px-2.5 py-1.5 text-left text-[13px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                  >
                    {c.name || "Sem nome"} <span className="text-text-tertiary">{c.email}</span>
                  </button>
                ))}
              </div>
            )}
            {contactId && (
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-emerald-400">
                Contato vinculado
                <button type="button" onClick={() => { setContactId(""); setContactQuery(""); }}>
                  <X size={12} />
                </button>
              </p>
            )}
          </div>

          <CamposDoFormulario
            defs={campos}
            rascunho={rascunho}
            prefixo="novo"
            colunas={2}
            onChange={(k, v) => setRascunho((r) => ({ ...r, [k]: v }))}
          />

          <div>
            <Label htmlFor="deal-desc">Observações</Label>
            <Textarea
              id="deal-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          {error && <p className="text-[13px] text-danger">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={busy || !form.name.trim()}>
              {busy && <Loader2 size={15} className="animate-spin" />} Criar
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
