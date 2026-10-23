"use client";

import * as React from "react";
import { Send, AlertTriangle } from "lucide-react";
import { cn, generateId } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { fieldBase } from "@/components/ui/styles";
import { pulsar } from "@/lib/fundo/eventos";
import type { Agent } from "@/lib/data/types";
import { OrbeDoAgente } from "@/components/agent-studio/orbe-do-agente";
import { PainelDoAgente } from "./painel-do-agente";

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

  // O que já ficou para trás (opções de um menu antigo) fica apagado.
  const ultimaDoAgente = messages.reduce((idx, m, i) => (m.role === "agent" ? i : idx), -1);

  // Até 1280px: uma coluna de leitura centrada (~720px). No desktop largo a
  // conversa ocupa a largura à esquerda (balões limitados a uma medida de
  // leitura) e à direita fica o painel do agente, com a orbe grande.
  return (
    <div className="flex min-h-0 flex-1 gap-6">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto flex w-full max-w-[720px] flex-col gap-3 px-1 py-4 sm:px-6 xl:mx-0 xl:max-w-none xl:pl-0 xl:pr-2">
            {messages.map((m, i) => (
              <div key={m.id} className={cn("flex flex-col", m.role === "user" ? "items-end" : "items-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-[18px] px-3.5 py-2 text-body sm:max-w-[66%] xl:max-w-[min(66%,560px)]",
                    m.role === "user"
                      ? "rounded-br-md bg-accent-solid text-text-on-accent"
                      : m.isError
                        ? "flex items-start gap-2 rounded-bl-md bg-danger-subtle text-danger"
                        : "rounded-bl-md border border-border-subtle bg-raised text-text-primary"
                  )}
                >
                  {m.isError && <AlertTriangle size={14} aria-hidden="true" className="mt-0.5 shrink-0" />}
                  <span>{m.text}</span>
                </div>
                {m.options && m.options.length > 0 && (
                  <div className={cn("mt-2 flex max-w-[85%] flex-wrap gap-1.5 sm:max-w-[66%] xl:max-w-[min(66%,560px)]", i < ultimaDoAgente && "opacity-50")}>
                    {m.options.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={(e) => {
                          pulsar(e.currentTarget, 1);
                          handleOptionClick(opt.id, opt.label);
                        }}
                        disabled={isTyping}
                        className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "text-text-secondary hover:text-text-primary")}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {isTyping && (
              <div className="flex items-center justify-start gap-2" aria-label="Digitando">
                {/* No desktop largo a orbe grande do painel já fala; aqui só abaixo disso. */}
                <OrbeDoAgente agenteId={agent.id} tamanho={26} falando leve className="xl:hidden" />
                <div className="flex items-center gap-1 rounded-[18px] rounded-bl-md border border-border-subtle bg-raised px-3.5 py-3">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary [animation-delay:-0.2s] motion-reduce:animate-none" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary motion-reduce:animate-none" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-text-tertiary [animation-delay:0.2s] motion-reduce:animate-none" />
                </div>
              </div>
            )}
          </div>
        </div>

        <form
          onSubmit={(e) => {
            // Mensagem enviada solta uma onda no fundo, a partir do botão.
            if (draft.trim() && !isTyping) pulsar(e.currentTarget.querySelector("button[type=submit]"), 1.2);
            void handleSend(e);
          }}
          className="mx-auto flex w-full max-w-[720px] items-center gap-2 px-1 pb-4 pt-2 sm:px-6 sm:pb-6 xl:mx-0 xl:max-w-none xl:pl-0 xl:pr-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Digite uma mensagem"
            aria-label="Mensagem para o agente"
            className={cn(fieldBase, "h-11 flex-1 rounded-full px-[18px]")}
          />
          <button
            type="submit"
            aria-label="Enviar"
            disabled={!draft.trim() || isTyping}
            className={cn(buttonVariants({ variant: "primary" }), "h-11 w-11 shrink-0 px-0")}
          >
            <Send size={16} aria-hidden="true" />
          </button>
        </form>
      </div>
      <PainelDoAgente agent={agent} falando={isTyping} className="hidden xl:flex" />
    </div>
  );
}
