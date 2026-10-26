"use client";

import * as React from "react";
import { RotateCcw, Send, Smartphone } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { fieldBase } from "@/components/ui/styles";
import { cn, generateId } from "@/lib/utils";
import { MidiaDaMensagem } from "./midia-da-mensagem";

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  options?: { id: string; label: string }[];
  media?: MidiaDaMensagem;
}

// Prévia ao vivo do fluxo, dentro do próprio Builder — sempre reflete a
// última versão salva (o autosave do canvas roda em paralelo). Usa um canal
// próprio ("builder_preview") pra não misturar com conversas reais do
// Playground/WhatsApp.
export function LivePreview({ agentId, agentName, aoResponder }: { agentId: string; agentName: string; /** Depois de cada resposta (o canvas acende o caminho). */ aoResponder?: () => void }) {
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
      const replies: Pick<ChatMessage, "text" | "options" | "media">[] = data.messages ?? [];
      setMessages((prev) => [
        ...prev,
        ...replies.map((r) => ({ id: generateId(), role: "agent" as const, text: r.text, options: r.options, media: r.media })),
      ]);
    } catch {
      setMessages((prev) => [...prev, { id: generateId(), role: "agent", text: "Erro ao processar essa mensagem." }]);
    } finally {
      setIsTyping(false);
      aoResponder?.();
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
    <div className="flex h-full w-[300px] shrink-0 flex-col rounded-[18px] border border-border-subtle bg-panel">
      <div className="flex items-center justify-between border-b border-border-subtle p-3.5">
        <div className="flex items-center gap-2">
          <Smartphone size={14} className="text-text-tertiary" />
          <div>
            <p className="text-small font-medium text-text-primary">Prévia ao vivo</p>
            <p className="text-caption text-text-tertiary">{agentName}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleReset}
          className={buttonVariants({ variant: "ghost", size: "icon" })}
          title="Reiniciar prévia"
          aria-label="Reiniciar prévia"
        >
          <RotateCcw size={13} />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="mt-6 text-center text-caption text-text-tertiary">
            Digite algo abaixo pra ver como a conversa flui com o fluxo salvo.
          </p>
        )}
        <div className="flex flex-col gap-2.5">
          {messages.map((m) => (
            <div key={m.id} className={cn("flex flex-col gap-1.5", m.role === "user" ? "items-end" : "items-start")}>
              {m.media && <MidiaDaMensagem media={m.media} />}
              {(m.text || !m.media) && (
                <div
                  className={cn(
                    "max-w-[85%] whitespace-pre-wrap break-words rounded-[18px] px-3 py-2 text-small",
                    m.role === "user" ? "rounded-br-md bg-accent-solid text-text-on-accent" : "rounded-bl-md border border-border-subtle bg-raised text-text-primary"
                  )}
                >
                  {m.text}
                </div>
              )}
              {m.options && m.options.length > 0 && (
                <div className="mt-1.5 flex max-w-[85%] flex-wrap gap-1">
                  {m.options.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleOption(opt.id, opt.label)}
                      disabled={isTyping}
                      className="h-7 rounded-full border border-border-subtle bg-raised px-2.5 text-caption font-medium text-text-secondary transition-colors hover:bg-hover hover:text-text-primary disabled:opacity-40"
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
              <div className="flex items-center gap-1 rounded-[18px] rounded-bl-md border border-border-subtle bg-raised px-3 py-2.5">
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
          placeholder="Testar mensagem…"
          aria-label="Mensagem de teste"
          className={cn(fieldBase, "h-9 flex-1 rounded-full px-3.5 text-small")}
        />
        <button
          type="submit"
          disabled={!draft.trim() || isTyping}
          aria-label="Enviar"
          className={cn(buttonVariants({ variant: "primary" }), "h-9 w-9 shrink-0 px-0")}
        >
          <Send size={14} aria-hidden="true" />
        </button>
      </form>
    </div>
  );
}
