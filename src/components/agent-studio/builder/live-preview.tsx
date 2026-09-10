"use client";

import * as React from "react";
import { RotateCcw, Smartphone } from "lucide-react";
import { cn, generateId } from "@/lib/utils";

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  options?: { id: string; label: string }[];
}

// Prévia ao vivo do fluxo, dentro do próprio Builder — sempre reflete a
// última versão salva (o autosave do canvas roda em paralelo). Usa um canal
// próprio ("builder_preview") pra não misturar com conversas reais do
// Playground/WhatsApp.
export function LivePreview({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const contactIdRef = React.useRef(generateId());
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  async function send(payload: { text?: string; optionId?: string }) {
    setIsTyping(true);
    try {
      const res = await fetch("/api/conversations/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, channel: "builder_preview", contactId: contactIdRef.current, ...payload }),
      });
      const data = await res.json();
      const replies: { text: string; options?: { id: string; label: string }[] }[] = data.messages ?? [];
      setMessages((prev) => [
        ...prev,
        ...replies.map((r) => ({ id: generateId(), role: "agent" as const, text: r.text, options: r.options })),
      ]);
    } catch {
      setMessages((prev) => [...prev, { id: generateId(), role: "agent", text: "Erro ao processar essa mensagem." }]);
    } finally {
      setIsTyping(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || isTyping) return;
    setMessages((prev) => [...prev, { id: generateId(), role: "user", text }]);
    setDraft("");
    await send({ text });
  }

  async function handleOption(optionId: string, label: string) {
    if (isTyping) return;
    setMessages((prev) => [...prev, { id: generateId(), role: "user", text: label }]);
    await send({ optionId });
  }

  function handleReset() {
    contactIdRef.current = generateId();
    setMessages([]);
  }

  return (
    <div className="glass-card flex h-full w-[300px] shrink-0 flex-col rounded-3xl">
      <div className="flex items-center justify-between border-b border-border-subtle p-3.5">
        <div className="flex items-center gap-2">
          <Smartphone size={14} className="text-text-tertiary" />
          <div>
            <p className="text-[12.5px] font-medium text-text-primary">Prévia ao vivo</p>
            <p className="text-[10.5px] text-text-tertiary">{agentName}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-surface-2 hover:text-text-primary"
          title="Reiniciar prévia"
        >
          <RotateCcw size={13} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="mt-6 text-center text-[12px] text-text-tertiary">
            Digite algo abaixo pra ver como a conversa flui com o fluxo salvo.
          </p>
        )}
        <div className="flex flex-col gap-2.5">
          {messages.map((m) => (
            <div key={m.id} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
              <div
                className={cn(
                  "max-w-[85%] rounded-2xl px-3 py-2 text-[12.5px] leading-relaxed",
                  m.role === "user" ? "bg-accent-500 text-white" : "border border-border-subtle bg-surface-2 text-text-primary"
                )}
              >
                {m.text}
              </div>
              {m.options && m.options.length > 0 && (
                <div className="mt-1.5 flex max-w-[85%] flex-wrap gap-1">
                  {m.options.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleOption(opt.id, opt.label)}
                      disabled={isTyping}
                      className="rounded-full border border-accent-500/40 bg-accent-soft px-2.5 py-1 text-[11.5px] font-medium text-accent-400 transition-colors hover:bg-accent-500/20 disabled:opacity-40"
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
              <div className="flex items-center gap-1 rounded-2xl border border-border-subtle bg-surface-2 px-3 py-2.5">
                <span className="h-1 w-1 animate-bounce rounded-full bg-text-tertiary [animation-delay:-0.2s]" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-text-tertiary" />
                <span className="h-1 w-1 animate-bounce rounded-full bg-text-tertiary [animation-delay:0.2s]" />
              </div>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-1.5 border-t border-border-subtle p-2.5">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Testar mensagem..."
          className="h-9 flex-1 rounded-lg border border-border-default bg-surface-2 px-3 text-[12.5px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-border-strong"
        />
        <button
          type="submit"
          disabled={!draft.trim() || isTyping}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-500 text-white transition-colors hover:bg-accent-400 disabled:opacity-40"
        >
          →
        </button>
      </form>
    </div>
  );
}
