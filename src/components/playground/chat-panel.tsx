"use client";

import * as React from "react";
import { Aperture, Send, RotateCcw, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { generateId } from "@/lib/utils";
import type { Agent } from "@/lib/data/types";

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  isError?: boolean;
  options?: { id: string; label: string }[];
}

function greeting(agent: Agent): ChatMessage {
  return { id: generateId(), role: "agent", text: `Olá! Sou o agente "${agent.name}". Pergunte algo pra testar.` };
}

export function ChatPanel({ agent }: { agent: Agent }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([greeting(agent)]);
  const [draft, setDraft] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const conversationIdRef = React.useRef(generateId());

  React.useEffect(() => {
    setMessages([greeting(agent)]);
    conversationIdRef.current = generateId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent.id]);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  async function send(payload: { text?: string; optionId?: string }) {
    setIsTyping(true);
    try {
      const res = await fetch("/api/conversations/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          channel: "playground",
          contactId: conversationIdRef.current,
          ...payload,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const replies: { text: string; options?: { id: string; label: string }[] }[] = data.messages ?? [];
      if (replies.length === 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: generateId(),
            role: "agent",
            isError: true,
            text: 'Sem resposta configurada ainda. Desenhe um fluxo no Builder ou cole uma URL em "Webhook de saída".',
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          ...replies.map((r) => ({ id: generateId(), role: "agent" as const, text: r.text, options: r.options })),
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: generateId(),
          role: "agent",
          isError: true,
          text: "Não consegui processar essa mensagem. Confira o fluxo/webhook desse agente.",
        },
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || isTyping) return;
    setMessages((prev) => [...prev, { id: generateId(), role: "user", text }]);
    setDraft("");
    await send({ text });
  }

  async function handleOptionClick(optionId: string, label: string) {
    if (isTyping) return;
    setMessages((prev) => [...prev, { id: generateId(), role: "user", text: label }]);
    await send({ optionId });
  }

  function handleReset() {
    setMessages([greeting(agent)]);
    conversationIdRef.current = generateId();
  }

  return (
    <div className="glass-card flex flex-1 flex-col rounded-3xl">
      <div className="flex items-center justify-between border-b border-border-subtle p-4">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-3 text-text-secondary">
            <Aperture size={15} />
          </span>
          <div>
            <p className="text-[13.5px] font-medium text-text-primary">{agent.name}</p>
            <p className="text-[11.5px] text-text-tertiary">Conversa via motor de fluxo</p>
          </div>
        </div>
        <button
          onClick={handleReset}
          type="button"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12px] font-medium text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
        >
          <RotateCcw size={13} /> Reiniciar
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-5">
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <div key={m.id} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed",
                  m.role === "user"
                    ? "bg-accent-500 text-white"
                    : m.isError
                      ? "flex items-start gap-2 border border-danger/25 bg-danger/10 text-danger"
                      : "border border-border-subtle bg-surface-2 text-text-primary"
                )}
              >
                {m.isError && <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
                <span>{m.text}</span>
              </div>
              {m.options && m.options.length > 0 && (
                <div className="mt-2 flex max-w-[75%] flex-wrap gap-1.5">
                  {m.options.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleOptionClick(opt.id, opt.label)}
                      disabled={isTyping}
                      className="rounded-full border border-accent-500/40 bg-accent-soft px-3 py-1.5 text-[12.5px] font-medium text-accent-400 transition-colors hover:bg-accent-500/20 disabled:opacity-40"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {isTyping && (
            <div className="flex justify-start">
              <div className="flex items-center gap-1 rounded-2xl border border-border-subtle bg-surface-2 px-4 py-3">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary [animation-delay:-0.2s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary [animation-delay:0.2s]" />
              </div>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-border-subtle p-4">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Digite uma mensagem..."
          className="h-11 flex-1 rounded-xl border border-border-default bg-surface-2 px-3.5 text-sm text-text-primary placeholder:text-text-tertiary outline-none transition-colors focus:border-border-strong"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isTyping}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-500 text-white transition-colors hover:bg-accent-400 disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
