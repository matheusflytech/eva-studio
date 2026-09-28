"use client";

import * as React from "react";
import { Send, Clock, FlaskConical, Users, Plus, X } from "lucide-react";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeDate } from "@/lib/utils";
import { listTemplates, type MessageTemplate } from "@/lib/data/templates";

interface Variant {
  id?: string;
  label: string;
  text: string;
  templateId: string | null;
  weight: number;
  sentCount?: number;
  failedCount?: number;
  replyCount?: number;
}

interface BroadcastRow {
  id: string;
  channel: string;
  text: string;
  audience: string;
  segmentName: string | null;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  status: string;
  scheduledAt: string | null;
  createdAt: string;
  variants: Variant[];
}

interface Channels {
  whatsapp_qr: boolean;
  whatsapp_meta: boolean;
  telegram: boolean;
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp_qr: "WhatsApp (QR)",
  whatsapp_meta: "WhatsApp (Meta)",
  telegram: "Telegram",
};

const STATUS_LABEL: Record<string, string> = {
  scheduled: "Agendado",
  sending: "Enviando...",
  done: "Concluído",
  canceled: "Cancelado",
};

const AUDIENCE_LABEL: Record<string, string> = {
  manual: "Lista manual",
  tags: "Por etiqueta",
  segment: "Por segmento",
};

export default function DisparosPage() {
  const { agents, isLoaded, load } = useAgentsStore();
  const [agentId, setAgentId] = React.useState<string | null>(null);
  const [channels, setChannels] = React.useState<Channels | null>(null);
  const [broadcasts, setBroadcasts] = React.useState<BroadcastRow[]>([]);
  const [tags, setTags] = React.useState<{ id: string; name: string }[]>([]);
  const [segments, setSegments] = React.useState<{ id: string; name: string }[]>([]);
  const [templates, setTemplates] = React.useState<MessageTemplate[]>([]);

  const [channel, setChannel] = React.useState<string>("whatsapp_qr");
  const [audience, setAudience] = React.useState<"manual" | "tags" | "segment">("manual");
  const [recipients, setRecipients] = React.useState("");
  const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
  const [segmentId, setSegmentId] = React.useState("");

  const [text, setText] = React.useState("");
  const [templateId, setTemplateId] = React.useState("");
  const [scheduledAt, setScheduledAt] = React.useState("");
  const [abEnabled, setAbEnabled] = React.useState(false);
  const [variants, setVariants] = React.useState<Variant[]>([
    { label: "A", text: "", templateId: null, weight: 1 },
    { label: "B", text: "", templateId: null, weight: 1 },
  ]);

  const [isSending, setIsSending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isLoaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  React.useEffect(() => {
    if (!agentId && agents.length > 0) setAgentId(agents[0].id);
  }, [agentId, agents]);

  const refresh = React.useCallback(async (id: string) => {
    const res = await fetch(`/api/agents/${id}/broadcasts`);
    const data = await res.json();
    setChannels(data.channels);
    setBroadcasts(data.broadcasts ?? []);
    setTags(data.tags ?? []);
    setSegments(data.segments ?? []);
  }, []);

  React.useEffect(() => {
    if (!agentId) return;
    refresh(agentId);
    listTemplates(agentId).then(setTemplates).catch(() => setTemplates([]));
    const interval = setInterval(() => refresh(agentId), 4000);
    return () => clearInterval(interval);
  }, [agentId, refresh]);

  React.useEffect(() => {
    if (!channels) return;
    const available = (Object.keys(channels) as (keyof Channels)[]).filter((c) => channels[c]);
    if (available.length > 0 && !channels[channel as keyof Channels]) setChannel(available[0]);
  }, [channels, channel]);

  const isMeta = channel === "whatsapp_meta";

  async function handleSend() {
    if (!agentId) return;
    setError(null);
    setNotice(null);
    setIsSending(true);

    const payload: Record<string, unknown> = { channel, audience };
    if (audience === "manual") {
      payload.contactIds = recipients.split(/[\n,]/).map((c) => c.trim()).filter(Boolean);
    } else if (audience === "tags") {
      payload.tagIds = selectedTags;
    } else {
      payload.segmentId = segmentId;
    }

    if (abEnabled) {
      payload.variants = variants.map((v) => ({
        label: v.label,
        text: v.text,
        templateId: v.templateId,
        weight: v.weight,
      }));
    } else {
      payload.text = text;
      payload.templateId = isMeta ? templateId : undefined;
    }

    if (scheduledAt) payload.scheduledAt = new Date(scheduledAt).toISOString();

    try {
      const res = await fetch(`/api/agents/${agentId}/broadcasts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro inesperado.");

      setNotice(
        data.scheduled
          ? `Agendado para ${new Date(data.scheduledAt).toLocaleString("pt-BR")} — ${data.estimatedCount} contato(s).`
          : `Disparo concluído: ${data.sentCount} enviados, ${data.failedCount} falharam.`
      );
      setRecipients("");
      setText("");
      setScheduledAt("");
      await refresh(agentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setIsSending(false);
    }
  }

  if (!isLoaded) return <div className="flex-1 p-8" />;

  if (agents.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-10">
        <EmptyState
          className="max-w-lg"
          icon={<Send size={30} className="text-text-secondary" />}
          title="Disparos"
          description="Crie um agente no Eva Studio primeiro pra poder mandar uma campanha."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-1 flex-col gap-5 p-8 pb-16">
      <div>
        <h1 className="font-display text-xl font-semibold text-text-primary">Disparos</h1>
        <p className="mt-1 text-[13px] text-text-secondary">
          Uma campanha para uma lista, uma etiqueta ou um segmento — agora ou com hora marcada.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova campanha</CardTitle>
          <CardDescription>
            Em público por etiqueta ou segmento, só entra quem aceita receber mensagem.
          </CardDescription>
        </CardHeader>

        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="disparo-agent">Agente</Label>
              <Select id="disparo-agent" value={agentId ?? ""} onChange={(e) => setAgentId(e.target.value)}>
                {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="disparo-channel">Canal</Label>
              <Select id="disparo-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
                {(["whatsapp_qr", "whatsapp_meta", "telegram"] as const).map((c) => (
                  <option key={c} value={c} disabled={channels ? !channels[c] : false}>
                    {CHANNEL_LABEL[c]}{channels && !channels[c] ? " — não conectado" : ""}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          {/* Público */}
          <div>
            <Label>Para quem</Label>
            <div className="mt-1.5 flex gap-2">
              {(["manual", "tags", "segment"] as const).map((a) => (
                <button
                  key={a}
                  type="button"
                  onClick={() => setAudience(a)}
                  className={
                    audience === a
                      ? "rounded-xl bg-accent-soft px-3 py-2 text-[13px] font-medium text-accent-400"
                      : "rounded-xl bg-surface-2 px-3 py-2 text-[13px] text-text-secondary transition-colors hover:bg-surface-3"
                  }
                >
                  {AUDIENCE_LABEL[a]}
                </button>
              ))}
            </div>
          </div>

          {audience === "manual" && (
            <div>
              <Label htmlFor="disparo-recipients">Contatos (um por linha, com DDI)</Label>
              <Textarea
                id="disparo-recipients"
                rows={4}
                className="font-mono text-[12.5px]"
                placeholder={"5511999998888\n5511999997777"}
                value={recipients}
                onChange={(e) => setRecipients(e.target.value)}
              />
            </div>
          )}

          {audience === "tags" && (
            <div>
              <Label>Etiquetas</Label>
              {tags.length === 0 ? (
                <p className="mt-1.5 text-[13px] text-text-tertiary">
                  Nenhuma etiqueta ainda. Crie em Contatos &gt; Etiquetas.
                </p>
              ) : (
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {tags.map((t) => {
                    const on = selectedTags.includes(t.id);
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() =>
                          setSelectedTags(on ? selectedTags.filter((x) => x !== t.id) : [...selectedTags, t.id])
                        }
                        className={
                          on
                            ? "rounded-full bg-accent-soft px-3 py-1.5 text-[12px] font-medium text-accent-400"
                            : "rounded-full bg-surface-3 px-3 py-1.5 text-[12px] text-text-secondary transition-colors hover:bg-surface-2"
                        }
                      >
                        {t.name}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="mt-1.5 text-[11.5px] text-text-tertiary">
                Quem tiver qualquer uma das etiquetas selecionadas entra na campanha.
              </p>
            </div>
          )}

          {audience === "segment" && (
            <div>
              <Label htmlFor="disparo-segment">Segmento</Label>
              <Select id="disparo-segment" value={segmentId} onChange={(e) => setSegmentId(e.target.value)}>
                <option value="">Selecione...</option>
                {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
              {segments.length === 0 && (
                <p className="mt-1.5 text-[13px] text-text-tertiary">
                  Nenhum segmento ainda. Crie em Contatos &gt; Segmentos.
                </p>
              )}
            </div>
          )}

          {/* Mensagem */}
          <div className="flex items-center justify-between border-t border-border-subtle pt-4">
            <Label className="mb-0">Mensagem</Label>
            <button
              type="button"
              onClick={() => setAbEnabled(!abEnabled)}
              className={
                abEnabled
                  ? "inline-flex items-center gap-1.5 rounded-xl bg-accent-soft px-3 py-1.5 text-[12px] font-medium text-accent-400"
                  : "inline-flex items-center gap-1.5 rounded-xl bg-surface-2 px-3 py-1.5 text-[12px] text-text-secondary transition-colors hover:bg-surface-3"
              }
            >
              <FlaskConical size={13} /> Teste A/B
            </button>
          </div>

          {abEnabled ? (
            <div className="flex flex-col gap-3">
              <p className="text-[12px] text-text-tertiary">
                Cada contato recebe uma das variantes, sorteada pelo peso. O placar de entrega fica separado por
                variante, para comparar as duas com número em vez de opinião.
              </p>
              {variants.map((v, i) => (
                <div key={i} className="flex flex-col gap-2 rounded-2xl bg-surface-2 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <Badge>{v.label}</Badge>
                    <Label className="mb-0 text-[12px]">Peso</Label>
                    <Input
                      type="number"
                      min={1}
                      className="w-[80px]"
                      value={v.weight}
                      onChange={(e) =>
                        setVariants(variants.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))
                      }
                    />
                    {isMeta && (
                      <Select
                        className="flex-1"
                        value={v.templateId ?? ""}
                        onChange={(e) =>
                          setVariants(variants.map((x, j) => (j === i ? { ...x, templateId: e.target.value || null } : x)))
                        }
                      >
                        <option value="">Modelo aprovado...</option>
                        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </Select>
                    )}
                    {variants.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setVariants(variants.filter((_, j) => j !== i))}
                        className="rounded-lg p-1.5 text-text-tertiary hover:bg-danger/10 hover:text-danger"
                        aria-label="Remover variante"
                      >
                        <X size={15} />
                      </button>
                    )}
                  </div>
                  <Textarea
                    rows={2}
                    value={v.text}
                    onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                    placeholder={`Texto da variante ${v.label}`}
                  />
                </div>
              ))}
              {variants.length < 4 && (
                <Button
                  type="button"
                  variant="secondary"
                  className="self-start"
                  onClick={() =>
                    setVariants([
                      ...variants,
                      { label: String.fromCharCode(65 + variants.length), text: "", templateId: null, weight: 1 },
                    ])
                  }
                >
                  <Plus size={15} /> Variante
                </Button>
              )}
            </div>
          ) : (
            <>
              {isMeta && (
                <div>
                  <Label htmlFor="disparo-template">Modelo aprovado</Label>
                  <Select id="disparo-template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                    <option value="">Selecione um modelo...</option>
                    {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </Select>
                  <p className="mt-1.5 text-[11.5px] text-text-tertiary">
                    Disparo pro canal oficial precisa ser modelo aprovado — a lista inteira está fora da janela de 24h.
                  </p>
                </div>
              )}
              <div>
                <Label htmlFor="disparo-text">Texto</Label>
                <Textarea
                  id="disparo-text"
                  rows={4}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Oi {nome}, tudo bem?"
                />
                <p className="mt-1.5 text-[11.5px] text-text-tertiary">
                  {"{nome}"}, {"{email}"} e os campos capturados no fluxo são trocados pelos dados de cada contato.
                </p>
              </div>
            </>
          )}

          <div className="border-t border-border-subtle pt-4">
            <Label htmlFor="disparo-quando">
              <span className="inline-flex items-center gap-1.5"><Clock size={13} /> Quando enviar</span>
            </Label>
            <Input
              id="disparo-quando"
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
            />
            <p className="mt-1.5 text-[11.5px] text-text-tertiary">
              Em branco, sai agora. Com hora marcada, quem entrega é o worker — a Vercel no plano grátis só roda cron
              uma vez por dia.
            </p>
          </div>

          {error && <p className="text-[13px] text-danger">{error}</p>}
          {notice && <p className="text-[13px] text-emerald-400">{notice}</p>}

          <Button type="button" onClick={handleSend} disabled={isSending}>
            <Send size={15} /> {isSending ? "Enviando..." : scheduledAt ? "Agendar" : "Disparar"}
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico</CardTitle>
        </CardHeader>
        {broadcasts.length === 0 ? (
          <p className="text-[13px] text-text-tertiary">Nenhum disparo ainda pra esse agente.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {broadcasts.map((b) => (
              <div key={b.id} className="rounded-xl border border-border-default bg-surface-2 px-3.5 py-3">
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="neutral">{CHANNEL_LABEL[b.channel] ?? b.channel}</Badge>
                    <Badge variant={b.status === "done" ? "success" : "neutral"}>
                      {STATUS_LABEL[b.status] ?? b.status}
                    </Badge>
                    <span className="inline-flex items-center gap-1 text-[11px] text-text-tertiary">
                      <Users size={11} /> {AUDIENCE_LABEL[b.audience] ?? b.audience}
                      {b.segmentName ? `: ${b.segmentName}` : ""}
                    </span>
                    {b.variants.length > 0 && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-text-tertiary">
                        <FlaskConical size={11} /> A/B
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-text-tertiary">
                    {b.scheduledAt && b.status === "scheduled"
                      ? new Date(b.scheduledAt).toLocaleString("pt-BR")
                      : formatRelativeDate(b.createdAt)}
                  </span>
                </div>
                <p className="truncate text-[13px] text-text-secondary">{b.text}</p>
                <p className="mt-1 text-[11.5px] text-text-tertiary">
                  {b.sentCount} enviados · {b.failedCount} falharam · {b.totalCount} no total
                </p>
                {b.variants.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-3 border-t border-border-subtle pt-2">
                    {b.variants.map((v) => (
                      <div key={v.id} className="text-[11.5px] text-text-tertiary">
                        <span className="font-semibold text-text-secondary">{v.label}</span>: {v.sentCount ?? 0}{" "}
                        enviados · {v.replyCount ?? 0} responderam
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
