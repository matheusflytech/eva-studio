"use client";

import * as React from "react";
import { Plus, Trash2, MessageSquareText, Sparkles, RotateCcw } from "lucide-react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn, generateId } from "@/lib/utils";

interface CommentAutomation {
  id: string;
  name: string;
  mediaId: string;
  keyword: string;
  publicReply: string;
  dmMessage: string;
  active: boolean;
  triggerCount: number;
}

type Draft = Pick<CommentAutomation, "name" | "mediaId" | "keyword" | "publicReply" | "dmMessage" | "active">;

const EMPTY_DRAFT: Draft = { name: "", mediaId: "", keyword: "", publicReply: "", dmMessage: "", active: true };

interface ChatMessage {
  id: string;
  role: "user" | "agent";
  text: string;
  options?: { id: string; label: string }[];
}

// Simulador de "alguém comentou X" — não precisa de conta Instagram
// conectada. Mostra a resposta pública/DM que a automação mandaria e deixa
// continuar digitando pra ver o resto do fluxo rodando de verdade (mesmo
// motor do Playground, canal builder_preview com um contactId novo a cada
// simulação).
function CommentSimulator({ agentId }: { agentId: string }) {
  const [commentText, setCommentText] = React.useState("");
  const [isSimulating, setIsSimulating] = React.useState(false);
  const [publicReply, setPublicReply] = React.useState<string | null>(null);
  const [noMatch, setNoMatch] = React.useState(false);
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [draft, setDraft] = React.useState("");
  const [isTyping, setIsTyping] = React.useState(false);
  const contactIdRef = React.useRef<string | null>(null);

  async function handleSimulate() {
    if (!commentText.trim() || isSimulating) return;
    setIsSimulating(true);
    setPublicReply(null);
    setNoMatch(false);
    setMessages([]);
    try {
      const res = await fetch(`/api/agents/${agentId}/comment-automations/simulate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: commentText }),
      });
      const data = await res.json();
      if (!data.matched) {
        setNoMatch(true);
        return;
      }
      setPublicReply(data.matched.publicReply);
      contactIdRef.current = generateId();
      setMessages([{ id: generateId(), role: "agent", text: data.matched.dmMessage }]);
    } finally {
      setIsSimulating(false);
    }
  }

  async function handleContinue() {
    const text = draft.trim();
    if (!text || isTyping || !contactIdRef.current) return;
    setMessages((prev) => [...prev, { id: generateId(), role: "user", text }]);
    setDraft("");
    setIsTyping(true);
    try {
      const res = await fetch("/api/conversations/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, channel: "builder_preview", contactId: contactIdRef.current, text }),
      });
      const data = await res.json();
      const replies: { text: string; options?: { id: string; label: string }[] }[] = data.messages ?? [];
      setMessages((prev) => [
        ...prev,
        ...replies.map((r) => ({ id: generateId(), role: "agent" as const, text: r.text, options: r.options })),
      ]);
    } finally {
      setIsTyping(false);
    }
  }

  function handleReset() {
    setCommentText("");
    setPublicReply(null);
    setNoMatch(false);
    setMessages([]);
    contactIdRef.current = null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-border-default bg-surface-2 p-4">
      <div className="flex items-center gap-2">
        <Sparkles size={14} className="text-accent-400" />
        <p className="text-[13px] font-medium text-text-primary">Simulador de comentário</p>
      </div>
      <p className="text-[12px] text-text-tertiary">
        Digite um comentário como se alguém tivesse escrito num post seu — mostra qual automação bateria e deixa
        continuar a conversa pra testar o fluxo depois da DM, sem precisar de conta conectada.
      </p>
      <div className="flex items-center gap-2">
        <Input
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="ex: quero o link 🙋"
          onKeyDown={(e) => e.key === "Enter" && handleSimulate()}
        />
        <Button type="button" variant="secondary" size="sm" onClick={handleSimulate} disabled={isSimulating}>
          Simular
        </Button>
        {(messages.length > 0 || noMatch) && (
          <button type="button" onClick={handleReset} className="shrink-0 rounded-lg p-2 text-text-tertiary hover:bg-surface-3 hover:text-text-primary">
            <RotateCcw size={14} />
          </button>
        )}
      </div>

      {noMatch && (
        <p className="text-[12.5px] text-text-tertiary">
          Nenhuma automação ativa bateria com esse comentário — o contato só ficaria com o comentário público, sem DM.
        </p>
      )}

      {publicReply && (
        <p className="rounded-lg border border-border-default bg-surface-3 px-3 py-2 text-[12.5px] text-text-secondary">
          <span className="font-medium text-text-primary">Resposta pública no comentário: </span>
          {publicReply}
        </p>
      )}

      {messages.length > 0 && (
        <div className="flex flex-col gap-2.5 rounded-xl border border-border-default bg-surface-3 p-3">
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
            </div>
          ))}
          {isTyping && <p className="text-[11.5px] text-text-tertiary">digitando...</p>}
          {/* div, não <form> — esse componente já vive dentro do <form> grande
              da página do agente; um <form> aninhado quebra o submit. */}
          <div className="flex items-center gap-1.5">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  handleContinue();
                }
              }}
              placeholder="Continuar a conversa..."
              className="h-9 flex-1 rounded-lg border border-border-default bg-surface-2 px-3 text-[12.5px] text-text-primary placeholder:text-text-tertiary outline-none focus:border-border-strong"
            />
            <Button type="button" size="sm" onClick={() => handleContinue()} disabled={!draft.trim() || isTyping}>
              Enviar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function CommentAutomationsEditor({ agentId }: { agentId: string }) {
  const [automations, setAutomations] = React.useState<CommentAutomation[] | null>(null);
  const [editingId, setEditingId] = React.useState<string | "new" | null>(null);
  const [draft, setDraft] = React.useState<Draft>(EMPTY_DRAFT);
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch(`/api/agents/${agentId}/comment-automations`);
    const data = await res.json();
    setAutomations(data.automations ?? []);
  }, [agentId]);

  React.useEffect(() => {
    load();
  }, [load]);

  function startNew() {
    setDraft(EMPTY_DRAFT);
    setEditingId("new");
    setError(null);
  }

  function startEdit(a: CommentAutomation) {
    setDraft({ name: a.name, mediaId: a.mediaId, keyword: a.keyword, publicReply: a.publicReply, dmMessage: a.dmMessage, active: a.active });
    setEditingId(a.id);
    setError(null);
  }

  async function handleSave() {
    if (!draft.name.trim() || !draft.dmMessage.trim()) {
      setError("Nome e mensagem privada são obrigatórios.");
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const url = editingId === "new" ? `/api/agents/${agentId}/comment-automations` : `/api/agents/${agentId}/comment-automations/${editingId}`;
      const res = await fetch(url, {
        method: editingId === "new" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro inesperado.");
      setEditingId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir essa automação?")) return;
    await fetch(`/api/agents/${agentId}/comment-automations/${id}`, { method: "DELETE" });
    await load();
  }

  if (automations === null) return <p className="text-[13px] text-text-tertiary">Carregando...</p>;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[12.5px] text-text-tertiary">
        Igual o recurso de comentário do ManyChat: alguém comenta uma palavra-chave num post/reel seu, o Eva Studio
        responde no comentário (opcional) e manda uma mensagem privada — que já entra no fluxo normal do Builder
        a partir daí.
      </p>

      {automations.length > 0 && (
        <div className="flex flex-col gap-2">
          {automations.map((a) => (
            <div key={a.id} className="rounded-xl border border-border-default bg-surface-2 px-3.5 py-3">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <MessageSquareText size={14} className="text-text-tertiary" />
                  <p className="text-[13px] font-medium text-text-primary">{a.name}</p>
                  <Badge variant={a.active ? "success" : "neutral"}>{a.active ? "Ativa" : "Pausada"}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => startEdit(a)} className="rounded-lg px-2 py-1.5 text-[12px] font-medium text-text-secondary hover:bg-surface-3 hover:text-text-primary">
                    Editar
                  </button>
                  <button type="button" onClick={() => handleDelete(a.id)} className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-3 hover:text-danger">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              <p className="text-[11.5px] text-text-tertiary">
                Gatilho: {a.keyword ? `"${a.keyword}"` : "qualquer comentário"} em {a.mediaId ? `post ${a.mediaId}` : "qualquer post"} ·{" "}
                {a.triggerCount} disparo(s)
              </p>
              <p className="mt-1 truncate text-[12px] text-text-secondary">DM: {a.dmMessage}</p>
            </div>
          ))}
        </div>
      )}

      {editingId ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border-default bg-surface-2 p-3.5">
          <div>
            <Label htmlFor="ca-name">Nome interno</Label>
            <Input id="ca-name" value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} placeholder="Ex: Comentou LINK no reel de lançamento" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ca-media">Id do post/reel (opcional)</Label>
              <Input id="ca-media" className="font-mono text-[12.5px]" value={draft.mediaId} onChange={(e) => setDraft((d) => ({ ...d, mediaId: e.target.value }))} placeholder="Vazio = qualquer post" />
            </div>
            <div>
              <Label htmlFor="ca-keyword">Palavra-chave (opcional)</Label>
              <Input id="ca-keyword" value={draft.keyword} onChange={(e) => setDraft((d) => ({ ...d, keyword: e.target.value }))} placeholder="Vazio = qualquer comentário" />
            </div>
          </div>
          <div>
            <Label htmlFor="ca-public">Resposta pública no comentário (opcional)</Label>
            <Textarea id="ca-public" rows={2} value={draft.publicReply} onChange={(e) => setDraft((d) => ({ ...d, publicReply: e.target.value }))} placeholder="Ex: Já te chamei no direct! 😍" />
          </div>
          <div>
            <Label htmlFor="ca-dm">Mensagem privada</Label>
            <Textarea id="ca-dm" rows={3} value={draft.dmMessage} onChange={(e) => setDraft((d) => ({ ...d, dmMessage: e.target.value }))} placeholder="Ex: Oi! Vi que você quer o link, aqui está: ..." />
          </div>
          <label className="flex items-center gap-2 text-[12.5px] text-text-secondary">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))} />
            Automação ativa
          </label>
          {error && <p className="text-[12.5px] text-danger">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
              Cancelar
            </Button>
            <Button type="button" size="sm" onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Salvando..." : "Salvar automação"}
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={startNew}
          className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-border-default py-2.5 text-[12.5px] font-medium text-text-secondary transition-colors hover:border-border-strong hover:text-text-primary"
        >
          <Plus size={14} /> Nova automação de comentário
        </button>
      )}

      <CommentSimulator agentId={agentId} />
    </div>
  );
}
