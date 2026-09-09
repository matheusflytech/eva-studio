"use client";

import * as React from "react";
import { Aperture, Send, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Agent } from "@/lib/data/types";

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
}

const SIMULATED_REPLIES = [
  "Entendi! Em produção, essa resposta viria do seu workflow no n8n, usando as instruções e a base de conhecimento configuradas.",
  "Anotado. Essa é uma simulação local — conecte o webhook de saída para ver respostas reais do seu agente.",
  "Perfeito. Assim que o webhook estiver conectado, essa conversa vai fluir direto para o seu fluxo no n8n.",
];

let messageCounter = 0;
function nextId() {
  messageCounter += 1;
  return `m-${messageCounter}`;
}

export function ChatPanel({ agent }: { agent: Agent }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([
    { id: nextId(), role: "agent", text: `Olá! Sou o agente "${agent.name}". Este é um teste simulado — pergunte algo para ver como a conversa flui.` },
  ]);
  const [draft, setDraft] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isTyping]);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setMessages((prev) => [...prev, { id: nextId(), role: "user", text }]);
    setDraft("");
    setIsTyping(true);
    setTimeout(() => {
      const reply = SIMULATED_REPLIES[Math.floor(Math.random() * SIMULATED_REPLIES.length)];
      setMessages((prev) => [...prev, { id: nextId(), role: "agent", text: reply }]);
      setIsTyping(false);
    }, 900);
  }

  function handleReset() {
    setMessages([
      { id: nextId(), role: "agent", text: `Olá! Sou o agente "${agent.name}". Este é um teste simulado — pergunte algo para ver como a conversa flui.` },
    ]);
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
            <p className="text-[11.5px] text-text-tertiary">Conversa simulada</p>
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
            <div
              key={m.id}
              className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
            >
              <div
                className={cn(
                  "max-w-[75%] rounded-2xl px-4 py-2.5 text-[13.5px] leading-relaxed",
                  m.role === "user"
                    ? "bg-ice text-bg-base"
                    : "border border-border-subtle bg-surface-2 text-text-primary"
                )}
              >
                {m.text}
              </div>
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
          disabled={!draft.trim()}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ice text-bg-base transition-colors hover:bg-white disabled:opacity-40"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
