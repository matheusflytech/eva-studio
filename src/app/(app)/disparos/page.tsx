"use client";

import * as React from "react";
import { Send } from "lucide-react";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatRelativeDate } from "@/lib/utils";
import { listTemplates, type MessageTemplate } from "@/lib/data/templates";

interface BroadcastRow {
  id: string;
  channel: string;
  text: string;
  totalCount: number;
  sentCount: number;
  failedCount: number;
  status: string;
  createdAt: string;
}

const CHANNEL_LABEL: Record<string, string> = { whatsapp_qr: "WhatsApp (QR)", whatsapp_meta: "WhatsApp (Meta)" };

export default function DisparosPage() {
  const { agents, isLoaded, load } = useAgentsStore();
  const [agentId, setAgentId] = React.useState<string | null>(null);
  const [channels, setChannels] = React.useState<{ whatsapp_qr: boolean; whatsapp_meta: boolean } | null>(null);
  const [broadcasts, setBroadcasts] = React.useState<BroadcastRow[]>([]);
  const [channel, setChannel] = React.useState<string>("whatsapp_qr");
  const [recipients, setRecipients] = React.useState("");
  const [text, setText] = React.useState("");
  const [templates, setTemplates] = React.useState<MessageTemplate[]>([]);
  const [templateId, setTemplateId] = React.useState("");
  const [variableValues, setVariableValues] = React.useState<Record<string, string>>({});
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
    if (channel === "whatsapp_qr" && !channels.whatsapp_qr && channels.whatsapp_meta) setChannel("whatsapp_meta");
    if (channel === "whatsapp_meta" && !channels.whatsapp_meta && channels.whatsapp_qr) setChannel("whatsapp_qr");
  }, [channels, channel]);

  const selectedTemplate = templates.find((t) => t.id === templateId) ?? null;

  async function handleSend() {
    if (!agentId) return;
    setError(null);
    setNotice(null);
    const contactIds = recipients.split(/[\n,]/).map((c) => c.trim()).filter(Boolean);
    if (contactIds.length === 0) {
      setError("Informe pelo menos um contato (um por linha).");
      return;
    }
    if (channel === "whatsapp_meta" && !templateId) {
      setError("Selecione um modelo aprovado — disparo pro canal oficial não pode ser texto livre.");
      return;
    }
    if (channel === "whatsapp_qr" && !text.trim()) {
      setError("Escreva a mensagem.");
      return;
    }

    setIsSending(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/broadcasts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          channel,
          contactIds,
          text: channel === "whatsapp_qr" ? text.trim() : undefined,
          templateId: channel === "whatsapp_meta" ? templateId : undefined,
          variableValues: channel === "whatsapp_meta" ? variableValues : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro inesperado.");
      setNotice(`Disparo criado para ${contactIds.length} contato(s).`);
      setRecipients("");
      setText("");
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
    <div className="mx-auto flex max-w-2xl flex-1 flex-col gap-5 p-8 pb-16">
      <div>
        <h1 className="font-display text-xl font-semibold text-text-primary">Disparos</h1>
        <p className="mt-1 text-[13px] text-text-secondary">
          Mande a mesma mensagem pra uma lista de contatos, pelo WhatsApp de um dos seus agentes.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Nova campanha</CardTitle>
          <CardDescription>Um envio único — sem agendamento ainda.</CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="disparo-agent">Agente</Label>
            <Select id="disparo-agent" value={agentId ?? ""} onChange={(e) => setAgentId(e.target.value)}>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </div>

          <div>
            <Label htmlFor="disparo-channel">Canal</Label>
            <Select id="disparo-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
              <option value="whatsapp_qr" disabled={channels ? !channels.whatsapp_qr : false}>
                WhatsApp (QR){channels && !channels.whatsapp_qr ? " — não conectado" : ""}
              </option>
              <option value="whatsapp_meta" disabled={channels ? !channels.whatsapp_meta : false}>
                WhatsApp (Meta){channels && !channels.whatsapp_meta ? " — não conectado" : ""}
              </option>
            </Select>
          </div>

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

          {channel === "whatsapp_meta" ? (
            <>
              <div>
                <Label htmlFor="disparo-template">Modelo aprovado</Label>
                <Select
                  id="disparo-template"
                  value={templateId}
                  onChange={(e) => {
                    setTemplateId(e.target.value);
                    setVariableValues({});
                  }}
                >
                  <option value="">Selecione um modelo...</option>
                  {templates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
                <p className="mt-1.5 text-[11.5px] text-text-tertiary">
                  Disparo pro canal oficial precisa ser um modelo aprovado (fora da janela de 24h com todo mundo da
                  lista) — cadastre em Eva Studio &gt; agente &gt; Modelos de mensagem.
                </p>
              </div>
              {selectedTemplate && selectedTemplate.variableOrder.length > 0 && (
                <div className="flex flex-col gap-2 rounded-xl border border-border-default bg-surface-2 p-3.5">
                  <p className="text-[12px] text-text-tertiary">
                    Mesmo valor aplicado a todos os contatos dessa campanha:
                  </p>
                  {selectedTemplate.variableOrder.map((name) => (
                    <div key={name}>
                      <Label htmlFor={`var-${name}`}>{"{" + name + "}"}</Label>
                      <Input
                        id={`var-${name}`}
                        value={variableValues[name] ?? ""}
                        onChange={(e) => setVariableValues((v) => ({ ...v, [name]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div>
              <Label htmlFor="disparo-text">Mensagem</Label>
              <Textarea id="disparo-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} />
            </div>
          )}

          {error && <p className="text-[13px] text-danger">{error}</p>}
          {notice && <p className="text-[13px] text-emerald-400">{notice}</p>}

          <Button type="button" onClick={handleSend} disabled={isSending}>
            <Send size={15} /> {isSending ? "Enviando..." : "Disparar"}
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
                  <div className="flex items-center gap-2">
                    <Badge variant="neutral">{CHANNEL_LABEL[b.channel] ?? b.channel}</Badge>
                    <Badge variant={b.status === "done" ? "success" : "neutral"}>
                      {b.status === "done" ? "Concluído" : "Enviando..."}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-text-tertiary">{formatRelativeDate(b.createdAt)}</span>
                </div>
                <p className="truncate text-[13px] text-text-secondary">{b.text}</p>
                <p className="mt-1 text-[11.5px] text-text-tertiary">
                  {b.sentCount} enviados · {b.failedCount} falharam · {b.totalCount} no total
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
