"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import {
  X, Trash2, Loader2, Plus, Building2, User, Clock, StickyNote, Archive,
} from "lucide-react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, formatRelativeDate } from "@/lib/utils";

interface Stage { id: string; name: string; type: string; probability: number }

interface DealFull {
  id: string;
  name: string;
  description: string;
  amountCents: number;
  probability: number;
  lostReason: string;
  expectedClosingAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  stageId: string;
  stage: Stage;
  pipeline: { id: string; name: string; stages: Stage[] };
  company: { id: string; name: string } | null;
  owner: { id: string; name: string } | null;
  contacts: { contact: { id: string; name: string; email: string; phone: string } }[];
  tasks: { id: string; type: string; text: string; dueAt: string | null; doneAt: string | null }[];
  notes: { id: string; text: string; createdAt: string }[];
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/**
 * Painel do negócio.
 *
 * Antes disso o card do kanban não abria: dava para criar e arrastar, e nada
 * mais. Um CRM em que o negócio não abre é uma lista de post-its.
 *
 * A trilha de etapas no topo é clicável e é a ação mais frequente aqui, por
 * isso vem antes dos campos.
 */
export function DealDrawer({
  dealId, onClose, onChanged,
}: {
  dealId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [deal, setDeal] = React.useState<DealFull | null>(null);
  const [form, setForm] = React.useState({ name: "", amount: "", description: "" });
  const [novaTarefa, setNovaTarefa] = React.useState("");
  const [novaNota, setNovaNota] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const carregar = React.useCallback(async () => {
    const res = await fetch(`/api/deals/${dealId}`);
    if (!res.ok) return;
    const data = await res.json();
    setDeal(data.deal);
    setForm({
      name: data.deal.name,
      amount: (data.deal.amountCents / 100).toFixed(2).replace(".", ","),
      description: data.deal.description ?? "",
    });
  }, [dealId]);

  React.useEffect(() => { carregar(); }, [carregar]);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    await carregar();
    onChanged();
  }

  async function criarTarefa() {
    if (!novaTarefa.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: novaTarefa.trim(), dealId, due: "+2 dias" }),
    });
    setNovaTarefa("");
    carregar();
  }

  async function criarNota() {
    if (!novaNota.trim()) return;
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: novaNota.trim(), dealId }),
    });
    setNovaNota("");
    carregar();
  }

  async function alternarTarefa(id: string, feita: boolean) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !feita }),
    });
    carregar();
  }

  // No servidor nao existe document; o portal so monta depois da hidratacao.
  const [montado, setMontado] = React.useState(false);
  React.useEffect(() => { setMontado(true); }, []);
  if (!montado) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-label="Detalhes do negócio">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} />
      {/* glass-card-solid: sem ele o kanban aparece por baixo do painel. */}
      <aside className="glass-card glass-card-solid relative z-10 flex h-full w-full max-w-[520px] flex-col overflow-y-auto rounded-l-3xl">
        {!deal ? (
          <p className="p-8 text-[13px] text-text-tertiary">Carregando...</p>
        ) : (
          <>
            <header className="flex items-start justify-between gap-3 border-b border-border-subtle p-6 pb-5">
              <div className="min-w-0">
                <input
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  onBlur={() => form.name !== deal.name && patch({ name: form.name })}
                  className="w-full bg-transparent font-display text-[20px] font-semibold text-text-primary outline-none"
                />
                <div className="mt-1 flex flex-wrap items-center gap-2.5 text-[12px] text-text-tertiary">
                  {deal.company && (
                    <span className="inline-flex items-center gap-1"><Building2 size={12} /> {deal.company.name}</span>
                  )}
                  {deal.owner && <span className="inline-flex items-center gap-1"><User size={12} /> {deal.owner.name}</span>}
                  {deal.closedAt && (
                    <Badge variant={deal.stage.type === "won" ? "success" : "danger"}>
                      {deal.stage.type === "won" ? "Ganho" : "Perdido"}
                    </Badge>
                  )}
                </div>
              </div>
              <button onClick={onClose} className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-2 hover:text-text-primary">
                <X size={18} />
              </button>
            </header>

            {/* Trilha de etapas. É a ação mais frequente, então vem primeiro. */}
            <section className="border-b border-border-subtle px-6 py-5">
              <Label>Etapa no funil {deal.pipeline.name}</Label>
              <div className="mt-2 flex gap-1.5">
                {deal.pipeline.stages.map((s) => {
                  const atual = s.id === deal.stageId;
                  const passada = deal.pipeline.stages.findIndex((x) => x.id === deal.stageId) >
                    deal.pipeline.stages.findIndex((x) => x.id === s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={busy}
                      onClick={() => !atual && patch({ stageId: s.id })}
                      title={`${s.name} · ${s.probability}%`}
                      className={cn(
                        "h-1.5 flex-1 rounded-full transition-colors",
                        atual
                          ? s.type === "won" ? "bg-emerald-400" : s.type === "lost" ? "bg-danger" : "bg-accent-500"
                          : passada ? "bg-accent-500/40" : "bg-surface-3 hover:bg-border-strong"
                      )}
                    />
                  );
                })}
              </div>
              <div className="mt-2 flex items-center justify-between text-[12px]">
                <span className="font-medium text-text-primary">{deal.stage.name}</span>
                <span className="text-text-tertiary">{deal.probability}% de chance</span>
              </div>
            </section>

            <section className="flex flex-col gap-4 border-b border-border-subtle px-6 py-5">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="d-valor">Valor</Label>
                  <Input
                    id="d-valor"
                    value={form.amount}
                    onChange={(e) => setForm({ ...form, amount: e.target.value })}
                    onBlur={() => patch({ amount: Number(form.amount.replace(/\./g, "").replace(",", ".")) || 0 })}
                  />
                  <p className="mt-1 text-[11px] text-text-tertiary">
                    Ponderado: {money(Math.round((deal.amountCents * deal.probability) / 100))}
                  </p>
                </div>
                <div>
                  <Label htmlFor="d-data">Previsão de fechamento</Label>
                  <Input
                    id="d-data"
                    type="date"
                    value={deal.expectedClosingAt ? deal.expectedClosingAt.slice(0, 10) : ""}
                    onChange={(e) => patch({ expectedClosingAt: e.target.value || null })}
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="d-desc">Observações</Label>
                <Textarea
                  id="d-desc"
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  onBlur={() => form.description !== deal.description && patch({ description: form.description })}
                />
              </div>

              {deal.stage.type === "lost" && (
                <div>
                  <Label htmlFor="d-motivo">Motivo da perda</Label>
                  <Input
                    id="d-motivo"
                    defaultValue={deal.lostReason}
                    onBlur={(e) => patch({ lostReason: e.target.value })}
                    placeholder="Preço, prazo, concorrente..."
                  />
                </div>
              )}
            </section>

            <section className="border-b border-border-subtle px-6 py-5">
              <Label>Pessoas</Label>
              <div className="mt-2 flex flex-col gap-1.5">
                {deal.contacts.length === 0 ? (
                  <p className="text-[12.5px] text-text-tertiary">Nenhum contato vinculado.</p>
                ) : (
                  deal.contacts.map(({ contact }) => (
                    <div key={contact.id} className="flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] text-text-primary">{contact.name || "Sem nome"}</div>
                        <div className="truncate text-[11.5px] text-text-tertiary">{contact.email || contact.phone}</div>
                      </div>
                      <button
                        onClick={() => patch({ removeContactId: contact.id })}
                        className="rounded-lg p-1.5 text-text-tertiary hover:bg-danger/10 hover:text-danger"
                        aria-label="Desvincular"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="border-b border-border-subtle px-6 py-5">
              <Label>Tarefas</Label>
              <div className="mt-2 flex flex-col gap-1">
                {deal.tasks.map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-start gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                    <Checkbox checked={!!t.doneAt} onCheckedChange={() => alternarTarefa(t.id, !!t.doneAt)} />
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-[13px]", t.doneAt ? "text-text-tertiary line-through" : "text-text-primary")}>
                        {t.text}
                      </span>
                      {t.dueAt && !t.doneAt && (
                        <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-text-tertiary">
                          <Clock size={10} /> {formatRelativeDate(t.dueAt)}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <Input
                  value={novaTarefa}
                  onChange={(e) => setNovaTarefa(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && criarTarefa()}
                  placeholder="Nova tarefa, vence em 2 dias"
                />
                <Button variant="secondary" onClick={criarTarefa} disabled={!novaTarefa.trim()}>
                  <Plus size={15} />
                </Button>
              </div>
            </section>

            <section className="px-6 py-5">
              <Label>Linha do tempo</Label>
              <div className="mt-2 flex gap-2">
                <Textarea
                  rows={2}
                  value={novaNota}
                  onChange={(e) => setNovaNota(e.target.value)}
                  placeholder="Registrar o que aconteceu..."
                />
                <Button variant="secondary" onClick={criarNota} disabled={!novaNota.trim()}>
                  <StickyNote size={15} />
                </Button>
              </div>
              <div className="mt-3 flex flex-col gap-2.5">
                {deal.notes.length === 0 ? (
                  <p className="text-[12.5px] text-text-tertiary">Nada registrado ainda.</p>
                ) : (
                  deal.notes.map((n) => (
                    <div key={n.id} className="rounded-xl bg-surface-2 px-3 py-2.5">
                      <p className="whitespace-pre-wrap text-[12.5px] text-text-secondary">{n.text}</p>
                      <p className="mt-1 text-[11px] text-text-tertiary">{formatRelativeDate(n.createdAt)}</p>
                    </div>
                  ))
                )}
              </div>
            </section>

            <footer className="mt-auto flex items-center justify-between gap-3 border-t border-border-subtle px-6 py-4">
              <Button
                variant="ghost"
                onClick={() => patch({ archived: !deal.archivedAt })}
                disabled={busy}
              >
                <Archive size={15} /> {deal.archivedAt ? "Desarquivar" : "Arquivar"}
              </Button>
              <Button
                variant="ghost"
                className="text-danger hover:bg-danger/10"
                onClick={async () => {
                  await fetch(`/api/deals/${dealId}`, { method: "DELETE" });
                  onChanged();
                  onClose();
                }}
              >
                <Trash2 size={15} /> Apagar
              </Button>
            </footer>
            {busy && (
              <span className="pointer-events-none absolute right-6 top-6 text-text-tertiary">
                <Loader2 size={15} className="animate-spin" />
              </span>
            )}
          </>
        )}
      </aside>
    </div>,
    document.body
  );
}
