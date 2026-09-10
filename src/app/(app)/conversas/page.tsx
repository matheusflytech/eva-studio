"use client";

import * as React from "react";
import { MessageSquare, UserCheck, PlayCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { cn, formatRelativeDate } from "@/lib/utils";

interface ConversationSummary {
  id: string;
  agentId: string;
  agentName: string;
  channel: string;
  contactId: string;
  status: string;
  updatedAt: string;
  lastContactMessageAt: string | null;
  lastMessage: { text: string; role: string; createdAt: string } | null;
}

interface Message {
  id: string;
  role: string;
  text: string;
  createdAt: string;
}

const CHANNEL_LABEL: Record<string, string> = {
  playground: "Playground",
  whatsapp_qr: "WhatsApp (QR)",
  whatsapp_meta: "WhatsApp (Meta)",
};

const STATUS_VARIANT: Record<string, "success" | "danger" | "neutral"> = {
  active: "success",
  waiting_human: "danger",
  ended: "neutral",
};

// Só faz sentido pro WhatsApp oficial (Meta) — via QR (Baileys) e Playground
// não têm essa regra de janela de 24h.
function windowLabel(c: ConversationSummary): { text: string; variant: "success" | "danger" } | null {
  if (c.channel !== "whatsapp_meta") return null;
  if (!c.lastContactMessageAt) return { text: "Fora da janela", variant: "danger" };
  const hoursLeft = 24 - (Date.now() - new Date(c.lastContactMessageAt).getTime()) / 3_600_000;
  return hoursLeft > 0
    ? { text: `Dentro da janela · ${Math.max(1, Math.floor(hoursLeft))}h restantes`, variant: "success" }
    : { text: "Fora da janela — precisa de modelo", variant: "danger" };
}

export default function ConversasPage() {
  const [conversations, setConversations] = React.useState<ConversationSummary[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [messages, setMessages] = React.useState<Message[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [isSending, setIsSending] = React.useState(false);
  const [isResuming, setIsResuming] = React.useState(false);

  const load = React.useCallback(async () => {
    const res = await fetch("/api/conversations");
    const data = await res.json();
    setConversations(data.conversations ?? []);
  }, []);

  const loadMessages = React.useCallback(async (id: string) => {
    const res = await fetch(`/api/conversations/${id}/messages`);
    const data = await res.json();
    setMessages(data.messages ?? []);
  }, []);

  React.useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, [load]);

  React.useEffect(() => {
    if (!selectedId) return;
    setIsLoadingMessages(true);
    loadMessages(selectedId).finally(() => setIsLoadingMessages(false));
  }, [selectedId, loadMessages]);

  async function handleSendReply(conversationId: string) {
    const text = draft.trim();
    if (!text || isSending) return;
    setIsSending(true);
    try {
      await fetch(`/api/conversations/${conversationId}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      setDraft("");
      await Promise.all([loadMessages(conversationId), load()]);
    } finally {
      setIsSending(false);
    }
  }

  async function handleResume(conversationId: string) {
    setIsResuming(true);
    try {
      await fetch(`/api/conversations/${conversationId}/resume`, { method: "POST" });
      await load();
    } finally {
      setIsResuming(false);
    }
  }

  if (conversations === null) return <div className="flex-1 p-8" />;

  if (conversations.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-10">
        <EmptyState
          className="max-w-lg"
          icon={<MessageSquare size={30} className="text-text-secondary" />}
          title="Conversas"
          description="Quando alguém falar com um dos seus agentes (Playground ou WhatsApp), a conversa aparece aqui."
        />
      </div>
    );
  }

  const selected = conversations.find((c) => c.id === selectedId) ?? conversations[0];

  return (
    <div className="flex flex-1 flex-col p-8">
      <div className="mb-5">
        <h1 className="font-display text-xl font-semibold text-text-primary">Conversas</h1>
        <p className="mt-1 text-[13px] text-text-secondary">Histórico real de conversas dos seus agentes.</p>
      </div>

      <div className="flex flex-1 gap-5 overflow-hidden">
        <div className="glass-card w-[300px] shrink-0 overflow-y-auto rounded-3xl p-2">
          {conversations.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setSelectedId(c.id)}
              className={cn(
                "flex w-full flex-col gap-1 rounded-2xl p-3 text-left transition-colors",
                (selected?.id ?? conversations[0].id) === c.id ? "bg-surface-3" : "hover:bg-surface-2"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-[13px] font-medium text-text-primary">{c.agentName}</p>
                <Badge variant={STATUS_VARIANT[c.status] ?? "neutral"}>{c.status}</Badge>
              </div>
              <p className="truncate text-[11.5px] text-text-tertiary">
                {CHANNEL_LABEL[c.channel] ?? c.channel} · {c.contactId}
              </p>
              {windowLabel(c) && (
                <Badge variant={windowLabel(c)!.variant} className="w-fit">
                  {windowLabel(c)!.text}
                </Badge>
              )}
              {c.lastMessage && (
                <p className="truncate text-[12px] text-text-secondary">
                  {c.lastMessage.role === "bot" ? "Bot: " : c.lastMessage.role === "human" ? "Atendente: " : ""}
                  {c.lastMessage.text}
                </p>
              )}
              <p className="text-[11px] text-text-tertiary">{formatRelativeDate(c.updatedAt)}</p>
            </button>
          ))}
        </div>

        <div className="glass-card flex flex-1 flex-col rounded-3xl">
          <div className="flex items-center justify-between gap-3 border-b border-border-subtle p-4">
            <div>
              <p className="text-[13.5px] font-medium text-text-primary">{selected.agentName}</p>
              <p className="text-[11.5px] text-text-tertiary">
                {CHANNEL_LABEL[selected.channel] ?? selected.channel} · {selected.contactId}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {windowLabel(selected) && <Badge variant={windowLabel(selected)!.variant}>{windowLabel(selected)!.text}</Badge>}
              {selected.status === "waiting_human" && (
                <Button type="button" variant="secondary" size="sm" onClick={() => handleResume(selected.id)} disabled={isResuming}>
                  <PlayCircle size={13} /> {isResuming ? "Retomando..." : "Retomar bot"}
                </Button>
              )}
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-5">
            {isLoadingMessages ? (
              <p className="text-[13px] text-text-tertiary">Carregando...</p>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((m) => (
                  <div key={m.id} className={cn("flex flex-col", m.role === "contact" ? "items-end" : "items-start")}>
                    {m.role === "human" && (
                      <span className="mb-1 flex items-center gap-1 text-[10.5px] font-medium text-amber-400">
                        <UserCheck size={11} /> Atendente
                      </span>
                    )}
                    <div
                      className={cn(
                        "max-w-[75%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed",
                        m.role === "contact"
                          ? "bg-accent-500 text-white"
                          : m.role === "human"
                            ? "border border-amber-500/30 bg-amber-500/10 text-text-primary"
                            : "border border-border-subtle bg-surface-2 text-text-primary"
                      )}
                    >
                      {m.text}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selected.status === "waiting_human" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendReply(selected.id);
              }}
              className="flex items-center gap-2 border-t border-border-subtle p-3.5"
            >
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Responder como atendente..."
                className="h-10 flex-1 rounded-xl border border-border-default bg-surface-2 px-3.5 text-[13px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-border-strong"
              />
              <Button type="submit" size="sm" disabled={!draft.trim() || isSending}>
                {isSending ? "Enviando..." : "Enviar"}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
