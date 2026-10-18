"use client";

import * as React from "react";
import { Plus, Trash2, Zap } from "lucide-react";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

type Kind = "dm_keyword" | "story_reply" | "story_mention";
type Mode = "any" | "exact" | "contains";

interface Trigger {
  id: string;
  name: string;
  kind: Kind;
  channels: string[];
  matchMode: Mode;
  keywords: string[];
  storyId: string;
  includeReactions: boolean;
  replyText: string;
  targetNodeId: string;
  priority: number;
  active: boolean;
  triggerCount: number;
  lastTriggeredAt: string | null;
}

type Draft = Omit<Trigger, "id" | "triggerCount" | "lastTriggeredAt" | "keywords"> & { keywords: string };

const KIND_LABEL: Record<Kind, string> = {
  dm_keyword: "Palavra-chave na mensagem",
  story_reply: "Resposta a story",
  story_mention: "Menção em story",
};

const CHANNEL_LABEL: Record<string, string> = {
  instagram: "Instagram",
  whatsapp_meta: "WhatsApp oficial",
  whatsapp_qr: "WhatsApp (QR)",
  messenger: "Messenger",
  telegram: "Telegram",
  website: "Site",
  tiktok: "TikTok",
};

function emptyDraft(kind: Kind): Draft {
  return {
    name: "",
    kind,
    channels: [],
    matchMode: kind === "dm_keyword" ? "contains" : "any",
    keywords: "",
    storyId: "",
    includeReactions: true,
    replyText: "",
    targetNodeId: "",
    priority: 0,
    active: true,
  };
}

interface FlowNodeOption {
  id: string;
  label: string;
}
interface StoryOption {
  id: string;
  preview: string;
  postedAt: string | null;
}

export function TriggersEditor({ agentId }: { agentId: string }) {
  const [triggers, setTriggers] = React.useState<Trigger[]>([]);
  const [nodes, setNodes] = React.useState<FlowNodeOption[]>([]);
  const [stories, setStories] = React.useState<StoryOption[]>([]);
  const [storiesReason, setStoriesReason] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const fetchAll = React.useCallback(async () => {
    const [t, f] = await Promise.all([
      fetch(`/api/agents/${agentId}/triggers`).then((r) => r.json()),
      fetch(`/api/flows/${agentId}`).then((r) => r.json()),
    ]);
    const flowNodes = (f.flow?.nodes ?? []) as { id: string; data?: { label?: string; iconKey?: string } }[];
    return {
      triggers: (t.triggers ?? []) as Trigger[],
      nodes: flowNodes
        .filter((n) => n.data?.iconKey !== "start")
        .map((n) => ({ id: n.id, label: n.data?.label || n.data?.iconKey || n.id })),
    };
  }, [agentId]);

  const load = React.useCallback(async () => {
    const data = await fetchAll();
    setTriggers(data.triggers);
    setNodes(data.nodes);
  }, [fetchAll]);

  React.useEffect(() => {
    let ativo = true;
    fetchAll().then((data) => {
      if (!ativo) return;
      setTriggers(data.triggers);
      setNodes(data.nodes);
    });
    return () => {
      ativo = false;
    };
  }, [fetchAll]);

  async function loadStories() {
    const r = await fetch(`/api/agents/${agentId}/instagram-stories`).then((res) => res.json());
    setStories(r.stories ?? []);
    setStoriesReason(r.reason ?? null);
  }

  function startNew(kind: Kind) {
    setEditingId(null);
    setError(null);
    setDraft(emptyDraft(kind));
    if (kind === "story_reply") void loadStories();
  }

  function startEdit(t: Trigger) {
    setEditingId(t.id);
    setError(null);
    setDraft({ ...t, keywords: t.keywords.join(", ") });
    if (t.kind === "story_reply") void loadStories();
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const url = editingId ? `/api/agents/${agentId}/triggers/${editingId}` : `/api/agents/${agentId}/triggers`;
      const res = await fetch(url, {
        method: editingId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Não foi possível salvar.");
        return;
      }
      setDraft(null);
      setEditingId(null);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string) {
    await fetch(`/api/agents/${agentId}/triggers/${id}`, { method: "DELETE" });
    await load();
  }

  function toggleChannel(c: string) {
    if (!draft) return;
    const has = draft.channels.includes(c);
    setDraft({ ...draft, channels: has ? draft.channels.filter((x) => x !== c) : [...draft.channels, c] });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" size="sm" onClick={() => startNew("dm_keyword")}>
          <Plus className="mr-1 h-4 w-4" /> Palavra-chave
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => startNew("story_reply")}>
          <Plus className="mr-1 h-4 w-4" /> Resposta a story
        </Button>
        <Button type="button" variant="secondary" size="sm" onClick={() => startNew("story_mention")}>
          <Plus className="mr-1 h-4 w-4" /> Menção em story
        </Button>
      </div>

      {triggers.length === 0 && !draft && (
        <p className="text-sm text-text-secondary">
          Nenhum gatilho. Sem gatilho, toda mensagem segue o fluxo padrão do agente.
        </p>
      )}

      <ul className="space-y-2">
        {triggers.map((t) => (
          <li key={t.id} className="flex items-center justify-between rounded-lg border border-border-default p-3">
            <button type="button" className="text-left" onClick={() => startEdit(t)}>
              <div className="flex items-center gap-2 font-medium">
                <Zap className="h-4 w-4" /> {t.name}
                {!t.active && <Badge variant="neutral">pausado</Badge>}
              </div>
              <div className="text-xs text-text-secondary">
                {KIND_LABEL[t.kind]}
                {t.keywords.length > 0 && ` · ${t.matchMode === "exact" ? "exata" : "contém"}: ${t.keywords.join(", ")}`}
                {t.storyId && " · story específico"}
                {` · disparou ${t.triggerCount}x`}
              </div>
            </button>
            <Button type="button" variant="ghost" size="icon" onClick={() => remove(t.id)} aria-label="Excluir gatilho">
              <Trash2 className="h-4 w-4" />
            </Button>
          </li>
        ))}
      </ul>

      {draft && (
        <div className="space-y-3 rounded-lg border border-border-default p-4">
          <div className="text-sm font-medium">{KIND_LABEL[draft.kind]}</div>

          <div>
            <Label>Nome</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>

          {draft.kind !== "story_mention" && (
            <div>
              <Label>Quando</Label>
              <select
                className="w-full rounded-lg border border-border-default bg-surface-2 p-2 text-sm"
                value={draft.matchMode}
                onChange={(e) => setDraft({ ...draft, matchMode: e.target.value as Mode })}
              >
                {draft.kind === "story_reply" && <option value="any">Qualquer resposta</option>}
                <option value="exact">A mensagem for exatamente</option>
                <option value="contains">A mensagem contiver</option>
              </select>
            </div>
          )}

          {draft.matchMode !== "any" && (
            <div>
              <Label>Palavras (separadas por vírgula)</Label>
              <Input
                value={draft.keywords}
                placeholder="promo, cupom, quero"
                onChange={(e) => setDraft({ ...draft, keywords: e.target.value })}
              />
            </div>
          )}

          {draft.kind === "story_reply" && (
            <>
              <div>
                <Label>Story</Label>
                <select
                  className="w-full rounded-lg border border-border-default bg-surface-2 p-2 text-sm"
                  value={stories.some((s) => s.id === draft.storyId) || !draft.storyId ? draft.storyId : "__manual"}
                  onChange={(e) => setDraft({ ...draft, storyId: e.target.value === "__manual" ? draft.storyId : e.target.value })}
                >
                  <option value="">Qualquer story</option>
                  {stories.map((s) => (
                    <option key={s.id} value={s.id}>
                      Story de {s.postedAt ? new Date(s.postedAt).toLocaleString("pt-BR") : s.id}
                    </option>
                  ))}
                  <option value="__manual">Informar ID…</option>
                </select>
                {storiesReason && <p className="mt-1 text-xs text-text-secondary">{storiesReason}</p>}
                <Input
                  className="mt-2"
                  value={draft.storyId}
                  placeholder="ID do story (vazio = qualquer)"
                  onChange={(e) => setDraft({ ...draft, storyId: e.target.value })}
                />
                <p className="mt-1 text-xs text-text-secondary">Story some em 24h — depois disso este gatilho não dispara mais.</p>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.includeReactions}
                  onChange={(e) => setDraft({ ...draft, includeReactions: e.target.checked })}
                />
                Também responder reações com emoji
              </label>
            </>
          )}

          {draft.kind === "dm_keyword" && (
            <div>
              <Label>Canais (nenhum marcado = todos)</Label>
              <div className="flex flex-wrap gap-3 text-sm">
                {Object.entries(CHANNEL_LABEL).map(([c, label]) => (
                  <label key={c} className="flex items-center gap-1">
                    <input type="checkbox" checked={draft.channels.includes(c)} onChange={() => toggleChannel(c)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <Label>Resposta (pode ter cupom, link e {"{variaveis}"})</Label>
            <Textarea value={draft.replyText} onChange={(e) => setDraft({ ...draft, replyText: e.target.value })} />
          </div>

          <div>
            <Label>Depois, seguir para o bloco</Label>
            <select
              className="w-full rounded-lg border border-border-default bg-surface-2 p-2 text-sm"
              value={draft.targetNodeId}
              onChange={(e) => setDraft({ ...draft, targetNodeId: e.target.value })}
            >
              <option value="">Não mudar a conversa</option>
              {nodes.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.label}
                </option>
              ))}
            </select>
            {nodes.length === 0 && (
              <p className="mt-1 text-xs text-text-secondary">Este agente não tem fluxo salvo: só a resposta será enviada.</p>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} />
            Ativo
          </label>

          {error && <p className="text-sm text-danger">{error}</p>}

          <div className="flex gap-2">
            <Button type="button" onClick={save} disabled={saving}>
              {saving ? "Salvando…" : "Salvar"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
