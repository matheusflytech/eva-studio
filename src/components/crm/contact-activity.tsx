"use client";

import * as React from "react";
import {
  Handshake, Clock, StickyNote, MessageSquare, Repeat, Plus, ChevronRight,
} from "lucide-react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { DealDrawer } from "@/components/crm/deal-drawer";
import { cn, formatRelativeDate } from "@/lib/utils";

interface DealRow {
  id: string; name: string; amountCents: number;
  stage: string; stageType: string; pipeline: string; closedAt: string | null;
}
interface TaskRow { id: string; type: string; text: string; dueAt: string | null; doneAt: string | null }
interface NoteRow { id: string; text: string; createdAt: string }
interface ConversationRow { id: string; channel: string; status: string; updatedAt: string }
interface EnrollmentRow {
  id: string; sequenceName: string; currentStep: number;
  status: string; stoppedReason: string | null; nextRunAt: string;
}

interface Activity {
  deals: DealRow[];
  tasks: TaskRow[];
  notes: NoteRow[];
  conversations: ConversationRow[];
  enrollments: EnrollmentRow[];
}

const VAZIO: Activity = { deals: [], tasks: [], notes: [], conversations: [], enrollments: [] };

function money(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp_meta: "WhatsApp", whatsapp_qr: "WhatsApp", instagram: "Instagram",
  messenger: "Messenger", telegram: "Telegram", tiktok: "TikTok", webchat: "Webchat",
};

/**
 * Tudo que aconteceu com o contato: negócios, tarefas, notas, conversas e
 * réguas.
 *
 * A rota `/api/contacts/[id]` já devolvia isso tudo desde o começo; era a tela
 * que jogava fora e mostrava só nome, e-mail e telefone. Ficha de contato sem
 * histórico obriga a pessoa a abrir quatro telas para responder "e aí, como
 * está esse cliente?".
 */
export function ContactActivity({
  contactId, onCountsChange,
}: {
  contactId: string;
  onCountsChange?: (abertos: number) => void;
}) {
  const [data, setData] = React.useState<Activity>(VAZIO);
  const [carregando, setCarregando] = React.useState(true);
  const [novaTarefa, setNovaTarefa] = React.useState("");
  const [novaNota, setNovaNota] = React.useState("");
  const [dealAberto, setDealAberto] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    const res = await fetch(`/api/contacts/${contactId}`);
    if (!res.ok) { setCarregando(false); return; }
    const d = await res.json();
    setData({
      deals: d.deals ?? [], tasks: d.tasks ?? [], notes: d.notes ?? [],
      conversations: d.conversations ?? [], enrollments: d.enrollments ?? [],
    });
    setCarregando(false);
  }, [contactId]);

  React.useEffect(() => { setCarregando(true); carregar(); }, [carregar]);

  React.useEffect(() => {
    onCountsChange?.(data.tasks.filter((t) => !t.doneAt).length);
  }, [data.tasks, onCountsChange]);

  async function criarTarefa() {
    if (!novaTarefa.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: novaTarefa.trim(), contactId, due: "+2 dias" }),
    });
    setNovaTarefa("");
    carregar();
  }

  async function criarNota() {
    if (!novaNota.trim()) return;
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: novaNota.trim(), contactId }),
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

  async function criarNegocio() {
    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Novo negócio", contactId }),
    });
    const d = await res.json().catch(() => ({}));
    await carregar();
    if (d.deal?.id) setDealAberto(d.deal.id);
  }

  if (carregando) {
    return <p className="py-8 text-center text-[13px] text-text-tertiary">Carregando histórico...</p>;
  }

  const vazio =
    data.deals.length === 0 && data.tasks.length === 0 && data.notes.length === 0 &&
    data.conversations.length === 0 && data.enrollments.length === 0;

  return (
    <div className="flex flex-col gap-5">
      {vazio && (
        <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[12.5px] text-text-tertiary">
          Nada registrado ainda. Crie um negócio, uma tarefa ou escreva a primeira nota.
        </p>
      )}

      <section>
        <div className="flex items-center justify-between">
          <Label>Negócios</Label>
          <button
            onClick={criarNegocio}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-accent-400 hover:text-accent-300"
          >
            <Plus size={12} /> Novo
          </button>
        </div>
        <div className="mt-1.5 flex flex-col gap-1.5">
          {data.deals.length === 0 ? (
            <p className="text-[12.5px] text-text-tertiary">Nenhum negócio com este contato.</p>
          ) : (
            data.deals.map((d) => (
              <button
                key={d.id}
                onClick={() => setDealAberto(d.id)}
                className="group flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-left transition-colors hover:bg-surface-3"
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <Handshake size={13} className="shrink-0 text-text-tertiary" />
                    <span className="truncate text-[13px] text-text-primary">{d.name}</span>
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-text-tertiary">
                    {d.pipeline} · {d.stage}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  {d.amountCents > 0 && (
                    <span className="text-[12.5px] font-semibold text-text-primary">{money(d.amountCents)}</span>
                  )}
                  {d.stageType === "won" && <Badge variant="success">Ganho</Badge>}
                  {d.stageType === "lost" && <Badge variant="danger">Perdido</Badge>}
                  <ChevronRight size={14} className="text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </button>
            ))
          )}
        </div>
      </section>

      <section>
        <Label>Tarefas</Label>
        <div className="mt-1.5 flex flex-col gap-1">
          {data.tasks.map((t) => {
            const atrasada = !t.doneAt && !!t.dueAt && new Date(t.dueAt).getTime() < Date.now();
            return (
              <label key={t.id} className="flex cursor-pointer items-start gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                <Checkbox checked={!!t.doneAt} onCheckedChange={() => alternarTarefa(t.id, !!t.doneAt)} />
                <span className="min-w-0 flex-1">
                  <span className={cn("block text-[13px]", t.doneAt ? "text-text-tertiary line-through" : "text-text-primary")}>
                    {t.text}
                  </span>
                  {t.dueAt && !t.doneAt && (
                    <span className={cn(
                      "mt-0.5 inline-flex items-center gap-1 text-[11px]",
                      atrasada ? "text-danger" : "text-text-tertiary"
                    )}>
                      <Clock size={10} /> {formatRelativeDate(t.dueAt)}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
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

      {data.enrollments.length > 0 && (
        <section>
          <Label>Sequências</Label>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {data.enrollments.map((e) => (
              <div key={e.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 py-2.5">
                <span className="min-w-0">
                  <span className="flex items-center gap-2">
                    <Repeat size={13} className="shrink-0 text-text-tertiary" />
                    <span className="truncate text-[13px] text-text-primary">{e.sequenceName}</span>
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-text-tertiary">
                    Passo {e.currentStep + 1}
                    {e.status === "active"
                      ? ` · próximo ${formatRelativeDate(e.nextRunAt)}`
                      : e.stoppedReason ? ` · parou: ${e.stoppedReason}` : ""}
                  </span>
                </span>
                <Badge variant={e.status === "active" ? "accent" : "neutral"}>
                  {e.status === "active" ? "Ativa" : e.status === "done" ? "Concluída" : "Parada"}
                </Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      {data.conversations.length > 0 && (
        <section>
          <Label>Conversas</Label>
          <div className="mt-1.5 flex flex-col gap-1.5">
            {data.conversations.map((c) => (
              <a
                key={c.id}
                href={`/conversas?c=${c.id}`}
                className="group flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 py-2.5 transition-colors hover:bg-surface-3"
              >
                <span className="flex items-center gap-2 text-[13px] text-text-primary">
                  <MessageSquare size={13} className="text-text-tertiary" />
                  {CHANNEL_LABEL[c.channel] ?? c.channel}
                </span>
                <span className="flex items-center gap-2 text-[11.5px] text-text-tertiary">
                  {formatRelativeDate(c.updatedAt)}
                  <ChevronRight size={14} className="opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      <section>
        <Label>Linha do tempo</Label>
        <div className="mt-1.5 flex gap-2">
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
          {data.notes.map((n) => (
            <div key={n.id} className="rounded-2xl bg-surface-2 px-3.5 py-2.5">
              <p className="whitespace-pre-wrap text-[12.5px] text-text-secondary">{n.text}</p>
              <p className="mt-1 text-[11px] text-text-tertiary">{formatRelativeDate(n.createdAt)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Fica depois do painel do contato no DOM, então pinta por cima dele. */}
      {dealAberto && (
        <DealDrawer
          dealId={dealAberto}
          onClose={() => setDealAberto(null)}
          onChanged={carregar}
        />
      )}
    </div>
  );
}
