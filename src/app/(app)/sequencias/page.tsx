"use client";

import * as React from "react";
import { Repeat, Plus, Trash2, Clock, X, Loader2, GripVertical, ArrowRight } from "lucide-react";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalContent } from "@/components/ui/modal";
import { listTemplates, type MessageTemplate } from "@/lib/data/templates";

interface SequenceStep {
  id?: string;
  order: number;
  delayMinutes: number;
  text: string;
  templateId: string | null;
  applyTagId: string | null;
}

interface Sequence {
  id: string;
  name: string;
  channel: string;
  active: boolean;
  trigger: string;
  triggerTag: { id: string; name: string } | null;
  triggerSegment: { id: string; name: string } | null;
  triggerStage: { id: string; name: string; pipeline: string } | null;
  triggerStageDays: number;
  allowReentry: boolean;
  stopOnReply: boolean;
  totalEnrollments: number;
  activeEnrollments: number;
  steps: SequenceStep[];
}

interface TagRow { id: string; name: string }
interface SegmentRow { id: string; name: string }
interface PipelineRow { id: string; name: string; stages: { id: string; name: string }[] }

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp_meta: "WhatsApp (oficial)",
  whatsapp_qr: "WhatsApp (QR)",
  telegram: "Telegram",
  instagram: "Instagram",
};

const TRIGGER_LABEL: Record<string, string> = {
  tag: "Ao receber etiqueta",
  segment: "Ao entrar no segmento",
  stage: "Por etapa do funil",
  manual: "Inscrição manual",
};

// Atraso é guardado em minutos, mas ninguém pensa em "2880 minutos".
/**
 * Gatilho por etapa: qual etapa e há quantos dias parado.
 *
 * Os dois campos juntos são o que separa duas réguas de naturezas diferentes:
 * com 0 dias é acompanhamento (entrou em Proposta, começa a falar), com 7 é
 * recuperação (esqueceram dele em Proposta faz uma semana).
 */
function StageTrigger({
  idPrefix, pipelines, stageId, days, onStage, onDays,
}: {
  idPrefix: string;
  pipelines: PipelineRow[];
  stageId: string;
  days: number;
  onStage: (id: string) => void;
  onDays: (n: number) => void;
}) {
  return (
    <div className="grid grid-cols-[1fr_140px] gap-4">
      <div>
        <Label htmlFor={`${idPrefix}-etapa`}>Etapa do funil</Label>
        <Select id={`${idPrefix}-etapa`} value={stageId} onChange={(e) => onStage(e.target.value)}>
          <option value="">Escolha...</option>
          {pipelines.map((p) => (
            <optgroup key={p.id} label={p.name}>
              {p.stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </optgroup>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor={`${idPrefix}-dias`}>Parado há</Label>
        <Input
          id={`${idPrefix}-dias`}
          type="number"
          min={0}
          value={days}
          onChange={(e) => onDays(Math.max(0, Number(e.target.value) || 0))}
        />
        <p className="mt-1 text-[11px] text-text-tertiary">dias. 0 = na hora</p>
      </div>
    </div>
  );
}

function formatDelay(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) {
    const h = minutes / 60;
    return `${Number.isInteger(h) ? h : h.toFixed(1)} h`;
  }
  const d = minutes / 1440;
  return `${Number.isInteger(d) ? d : d.toFixed(1)} dia${d === 1 ? "" : "s"}`;
}

const DELAY_PRESETS = [
  { label: "Imediato", value: 0 },
  { label: "15 minutos", value: 15 },
  { label: "1 hora", value: 60 },
  { label: "3 horas", value: 180 },
  { label: "1 dia", value: 1440 },
  { label: "3 dias", value: 4320 },
  { label: "7 dias", value: 10080 },
];

export default function SequenciasPage() {
  const { agents, isLoaded, load } = useAgentsStore();
  const [agentId, setAgentId] = React.useState<string | null>(null);
  const [sequences, setSequences] = React.useState<Sequence[]>([]);
  const [tags, setTags] = React.useState<TagRow[]>([]);
  const [segments, setSegments] = React.useState<SegmentRow[]>([]);
  const [pipelines, setPipelines] = React.useState<PipelineRow[]>([]);
  const [templates, setTemplates] = React.useState<MessageTemplate[]>([]);
  const [editing, setEditing] = React.useState<Sequence | null>(null);
  const [showNew, setShowNew] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isLoaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  React.useEffect(() => {
    if (!agentId && agents.length > 0) setAgentId(agents[0].id);
  }, [agentId, agents]);

  const refresh = React.useCallback(async () => {
    if (!agentId) return;
    const [seqRes, tagRes, segRes, pipeRes, tpl] = await Promise.all([
      fetch(`/api/agents/${agentId}/sequences`).then((r) => r.json()),
      fetch(`/api/tags`).then((r) => r.json()),
      fetch(`/api/segments`).then((r) => r.json()),
      fetch(`/api/pipelines`).then((r) => r.json()),
      listTemplates(agentId).catch(() => []),
    ]);
    setSequences(seqRes.sequences ?? []);
    setTags(tagRes.tags ?? []);
    setSegments(segRes.segments ?? []);
    setPipelines(pipeRes.pipelines ?? []);
    setTemplates(tpl);
  }, [agentId]);

  React.useEffect(() => { refresh(); }, [refresh]);

  async function toggleActive(sequence: Sequence) {
    if (!agentId) return;
    setError(null);
    const res = await fetch(`/api/agents/${agentId}/sequences/${sequence.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !sequence.active }),
    });
    if (!res.ok) setError((await res.json()).error ?? "Não foi possível alterar a sequência.");
    refresh();
  }

  async function remove(id: string) {
    if (!agentId) return;
    await fetch(`/api/agents/${agentId}/sequences/${id}`, { method: "DELETE" });
    refresh();
  }

  if (isLoaded && agents.length === 0) {
    return (
      <EmptyState
        icon={<Repeat size={40} className="text-text-tertiary" />}
        title="Nenhum agente ainda"
        description="Sequências mandam mensagens de acompanhamento em nome de um agente. Crie um agente primeiro."
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-primary">Sequências</h1>
          <p className="mt-1 max-w-2xl text-[15px] text-text-secondary">
            Régua de acompanhamento: uma fila de mensagens com espera entre elas, que o contato entra sozinho ao
            receber uma etiqueta e sai sozinho ao responder.
          </p>
        </div>
        <div className="flex items-end gap-3">
          <div className="w-[220px]">
            <Label htmlFor="seq-agente">Agente</Label>
            <Select id="seq-agente" value={agentId ?? ""} onChange={(e) => setAgentId(e.target.value)}>
              {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </div>
          <Button onClick={() => setShowNew(true)}>
            <Plus size={15} /> Nova sequência
          </Button>
        </div>
      </header>

      {error && <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>}

      {sequences.length === 0 ? (
        <EmptyState
          icon={<Repeat size={36} className="text-text-tertiary" />}
          title="Nenhuma sequência ainda"
          description="Ex: quem pediu orçamento e não respondeu recebe uma lembrança em 1 dia e outra em 3."
          action={<Button onClick={() => setShowNew(true)}><Plus size={15} /> Nova sequência</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {sequences.map((s) => (
            <Card key={s.id} className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <h2 className="font-display text-[17px] font-semibold text-text-primary">{s.name}</h2>
                    <Badge variant={s.active ? "success" : "neutral"}>{s.active ? "Ativa" : "Pausada"}</Badge>
                  </div>
                  <p className="mt-1 text-[13px] text-text-secondary">
                    {CHANNEL_LABEL[s.channel] ?? s.channel} · {TRIGGER_LABEL[s.trigger]}
                    {s.trigger === "tag" && s.triggerTag && ` “${s.triggerTag.name}”`}
                    {s.trigger === "segment" && s.triggerSegment && ` “${s.triggerSegment.name}”`}
                    {s.trigger === "stage" && s.triggerStage &&
                      ` “${s.triggerStage.name}”${s.triggerStageDays > 0 ? ` parado há ${s.triggerStageDays}d` : ""}`}
                    {" · "}
                    {s.steps.length} passo{s.steps.length === 1 ? "" : "s"}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="font-display text-lg font-semibold text-text-primary">{s.activeEnrollments}</div>
                    <div className="text-[11px] uppercase tracking-wide text-text-tertiary">na régua</div>
                  </div>
                  <Switch checked={s.active} onCheckedChange={() => toggleActive(s)} aria-label="Ativar sequência" />
                  <Button variant="secondary" onClick={() => setEditing(s)}>Editar</Button>
                  <button
                    onClick={() => remove(s.id)}
                    className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-danger/10 hover:text-danger"
                    aria-label={`Apagar sequência ${s.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>

              {s.steps.length > 0 && (
                <ol className="flex flex-wrap items-center gap-2">
                  {s.steps.map((step, i) => (
                    <li key={step.id ?? i} className="flex items-center gap-2">
                      <div className="max-w-[230px] rounded-2xl bg-surface-2 px-3 py-2">
                        <div className="flex items-center gap-1.5 text-[11px] text-text-tertiary">
                          <Clock size={11} /> {formatDelay(step.delayMinutes)}
                        </div>
                        <div className="mt-0.5 truncate text-[13px] text-text-primary">{step.text}</div>
                      </div>
                      {i < s.steps.length - 1 && <ArrowRight size={14} className="text-text-tertiary" />}
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          ))}
        </div>
      )}

      {showNew && agentId && (
        <NewSequenceModal
          agentId={agentId}
          tags={tags}
          segments={segments}
          pipelines={pipelines}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); refresh(); }}
          onError={setError}
        />
      )}

      {editing && agentId && (
        <SequenceEditor
          agentId={agentId}
          sequence={editing}
          tags={tags}
          segments={segments}
          pipelines={pipelines}
          templates={templates}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh(); }}
          onError={setError}
        />
      )}
    </div>
  );
}

function NewSequenceModal({
  agentId, tags, segments, pipelines, onClose, onCreated, onError,
}: {
  agentId: string;
  tags: TagRow[];
  segments: SegmentRow[];
  pipelines: PipelineRow[];
  onClose: () => void;
  onCreated: () => void;
  onError: (e: string | null) => void;
}) {
  const [name, setName] = React.useState("");
  const [channel, setChannel] = React.useState("whatsapp_meta");
  const [trigger, setTrigger] = React.useState("tag");
  const [triggerTagId, setTriggerTagId] = React.useState("");
  const [triggerSegmentId, setTriggerSegmentId] = React.useState("");
  const [triggerStageId, setTriggerStageId] = React.useState("");
  const [triggerStageDays, setTriggerStageDays] = React.useState(0);
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    onError(null);
    const res = await fetch(`/api/agents/${agentId}/sequences`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, channel, trigger, triggerTagId, triggerSegmentId, triggerStageId, triggerStageDays,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      onError((await res.json()).error ?? "Não foi possível criar a sequência.");
      return;
    }
    onCreated();
  }

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent title="Nova sequência" description="Depois de criar, você adiciona os passos e liga a régua.">
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="ns-nome">Nome</Label>
            <Input id="ns-nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: follow-up de orçamento" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="ns-canal">Canal</Label>
              <Select id="ns-canal" value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="whatsapp_meta">WhatsApp (oficial)</option>
                <option value="whatsapp_qr">WhatsApp (QR)</option>
                <option value="telegram">Telegram</option>
                <option value="instagram">Instagram</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="ns-gatilho">Entra quando</Label>
              <Select id="ns-gatilho" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
                <option value="tag">Recebe uma etiqueta</option>
                <option value="segment">Entra num segmento</option>
                <option value="stage">Negócio entra numa etapa</option>
                <option value="manual">Só inscrição manual</option>
              </Select>
            </div>
          </div>

          {trigger === "tag" && (
            <div>
              <Label htmlFor="ns-tag">Etiqueta gatilho</Label>
              <Select id="ns-tag" value={triggerTagId} onChange={(e) => setTriggerTagId(e.target.value)}>
                <option value="">Escolha...</option>
                {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            </div>
          )}
          {trigger === "segment" && (
            <div>
              <Label htmlFor="ns-seg">Segmento gatilho</Label>
              <Select id="ns-seg" value={triggerSegmentId} onChange={(e) => setTriggerSegmentId(e.target.value)}>
                <option value="">Escolha...</option>
                {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </div>
          )}
          {trigger === "stage" && (
            <StageTrigger
              idPrefix="ns"
              pipelines={pipelines}
              stageId={triggerStageId}
              days={triggerStageDays}
              onStage={setTriggerStageId}
              onDays={setTriggerStageDays}
            />
          )}

          {channel === "instagram" && (
            <p className="rounded-2xl bg-surface-2 px-4 py-3 text-[12px] text-text-secondary">
              No Instagram a Meta só permite mensagem automatizada dentro de 24h da última mensagem da pessoa. Passos
              marcados para depois disso não serão entregues.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={saving || !name.trim()}>
              {saving && <Loader2 size={15} className="animate-spin" />} Criar
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}

function SequenceEditor({
  agentId, sequence, tags, segments, pipelines, templates, onClose, onSaved, onError,
}: {
  agentId: string;
  sequence: Sequence;
  tags: TagRow[];
  segments: SegmentRow[];
  pipelines: PipelineRow[];
  templates: MessageTemplate[];
  onClose: () => void;
  onSaved: () => void;
  onError: (e: string | null) => void;
}) {
  const [name, setName] = React.useState(sequence.name);
  const [channel, setChannel] = React.useState(sequence.channel);
  const [trigger, setTrigger] = React.useState(sequence.trigger);
  const [triggerTagId, setTriggerTagId] = React.useState(sequence.triggerTag?.id ?? "");
  const [triggerSegmentId, setTriggerSegmentId] = React.useState(sequence.triggerSegment?.id ?? "");
  const [triggerStageId, setTriggerStageId] = React.useState(sequence.triggerStage?.id ?? "");
  const [triggerStageDays, setTriggerStageDays] = React.useState(sequence.triggerStageDays ?? 0);
  const [stopOnReply, setStopOnReply] = React.useState(sequence.stopOnReply);
  const [allowReentry, setAllowReentry] = React.useState(sequence.allowReentry);
  const [steps, setSteps] = React.useState<SequenceStep[]>(sequence.steps);
  const [saving, setSaving] = React.useState(false);

  function updateStep(index: number, patch: Partial<SequenceStep>) {
    setSteps(steps.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  async function save() {
    setSaving(true);
    onError(null);
    const res = await fetch(`/api/agents/${agentId}/sequences/${sequence.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, channel, trigger, triggerTagId, triggerSegmentId, triggerStageId, triggerStageDays,
        stopOnReply, allowReentry, steps,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      onError((await res.json()).error ?? "Não foi possível salvar.");
      return;
    }
    onSaved();
  }

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent className="max-w-3xl" title={`Editar “${sequence.name}”`}>
        <div className="flex max-h-[70vh] flex-col gap-5 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="es-nome">Nome</Label>
              <Input id="es-nome" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="es-canal">Canal</Label>
              <Select id="es-canal" value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="whatsapp_meta">WhatsApp (oficial)</option>
                <option value="whatsapp_qr">WhatsApp (QR)</option>
                <option value="telegram">Telegram</option>
                <option value="instagram">Instagram</option>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="es-gatilho">Entra quando</Label>
              <Select id="es-gatilho" value={trigger} onChange={(e) => setTrigger(e.target.value)}>
                <option value="tag">Recebe uma etiqueta</option>
                <option value="segment">Entra num segmento</option>
                <option value="stage">Negócio entra numa etapa</option>
                <option value="manual">Só inscrição manual</option>
              </Select>
            </div>
            {trigger === "tag" && (
              <div>
                <Label htmlFor="es-tag">Etiqueta</Label>
                <Select id="es-tag" value={triggerTagId} onChange={(e) => setTriggerTagId(e.target.value)}>
                  <option value="">Escolha...</option>
                  {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </div>
            )}
            {trigger === "segment" && (
              <div>
                <Label htmlFor="es-seg">Segmento</Label>
                <Select id="es-seg" value={triggerSegmentId} onChange={(e) => setTriggerSegmentId(e.target.value)}>
                  <option value="">Escolha...</option>
                  {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
            )}
          </div>

          {trigger === "stage" && (
            <StageTrigger
              idPrefix="es"
              pipelines={pipelines}
              stageId={triggerStageId}
              days={triggerStageDays}
              onStage={setTriggerStageId}
              onDays={setTriggerStageDays}
            />
          )}

          <div className="flex flex-col gap-2.5 rounded-2xl bg-surface-2 px-4 py-3">
            <label className="flex items-center justify-between gap-4">
              <span>
                <span className="block text-[13px] font-medium text-text-primary">Sair ao responder</span>
                <span className="block text-[12px] text-text-tertiary">
                  Respondeu, a régua para. Deixar desligado transforma follow-up em insistência.
                </span>
              </span>
              <Switch checked={stopOnReply} onCheckedChange={setStopOnReply} />
            </label>
            <label className="flex items-center justify-between gap-4 border-t border-border-subtle pt-2.5">
              <span>
                <span className="block text-[13px] font-medium text-text-primary">Permitir entrar de novo</span>
                <span className="block text-[12px] text-text-tertiary">
                  Quem já passou pela régua pode ser inscrito outra vez.
                </span>
              </span>
              <Switch checked={allowReentry} onCheckedChange={setAllowReentry} />
            </label>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>Passos</Label>
              <span className="text-[12px] text-text-tertiary">
                A espera de cada passo conta a partir do passo anterior.
              </span>
            </div>

            {steps.map((step, index) => (
              <div key={index} className="flex gap-3 rounded-2xl bg-surface-2 px-4 py-3">
                <div className="flex flex-col items-center gap-1 pt-1.5 text-text-tertiary">
                  <GripVertical size={14} />
                  <span className="text-[11px] font-semibold">{index + 1}</span>
                </div>
                <div className="flex flex-1 flex-col gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Select
                      className="w-[150px]"
                      value={DELAY_PRESETS.some((p) => p.value === step.delayMinutes) ? String(step.delayMinutes) : "custom"}
                      onChange={(e) => {
                        if (e.target.value !== "custom") updateStep(index, { delayMinutes: Number(e.target.value) });
                      }}
                    >
                      {DELAY_PRESETS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                      <option value="custom">Outro (minutos)</option>
                    </Select>
                    {!DELAY_PRESETS.some((p) => p.value === step.delayMinutes) && (
                      <Input
                        className="w-[110px]"
                        type="number"
                        min={0}
                        value={step.delayMinutes}
                        onChange={(e) => updateStep(index, { delayMinutes: Number(e.target.value) })}
                      />
                    )}

                    {channel === "whatsapp_meta" && (
                      <Select
                        className="w-[220px]"
                        value={step.templateId ?? ""}
                        onChange={(e) => updateStep(index, { templateId: e.target.value || null })}
                      >
                        <option value="">Modelo fora da janela: nenhum</option>
                        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </Select>
                    )}

                    <Select
                      className="w-[190px]"
                      value={step.applyTagId ?? ""}
                      onChange={(e) => updateStep(index, { applyTagId: e.target.value || null })}
                    >
                      <option value="">Sem etiqueta ao entregar</option>
                      {tags.map((t) => <option key={t.id} value={t.id}>Etiquetar: {t.name}</option>)}
                    </Select>

                    <button
                      onClick={() => setSteps(steps.filter((_, i) => i !== index))}
                      className="ml-auto rounded-lg p-1.5 text-text-tertiary hover:bg-danger/10 hover:text-danger"
                      aria-label="Remover passo"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  <Textarea
                    rows={2}
                    value={step.text}
                    onChange={(e) => updateStep(index, { text: e.target.value })}
                    placeholder="Oi {nome}, vi que você pediu um orçamento. Ficou alguma dúvida?"
                  />
                </div>
              </div>
            ))}

            <Button
              variant="secondary"
              className="self-start"
              onClick={() =>
                setSteps([
                  ...steps,
                  { order: steps.length + 1, delayMinutes: steps.length === 0 ? 60 : 1440, text: "", templateId: null, applyTagId: null },
                ])
              }
            >
              <Plus size={15} /> Adicionar passo
            </Button>

            {channel === "whatsapp_meta" && (
              <p className="text-[12px] text-text-tertiary">
                Passo que cair fora da janela de 24h precisa de um modelo aprovado. Sem ele, a régua desse contato para
                com o motivo registrado, em vez de tentar um envio que a Meta recusaria.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border-subtle pt-4">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 size={15} className="animate-spin" />} Salvar
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
