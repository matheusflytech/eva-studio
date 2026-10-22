"use client";

import * as React from "react";
import {
  AtSign,
  ChevronsUpDown,
  CircleHelp,
  Clock,
  GripVertical,
  Mail,
  MessageCircle,
  Plus,
  Repeat,
  Send,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Switch } from "@/components/ui/switch";
import { Notice } from "@/components/ui/notice";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { pulsar } from "@/lib/fundo/eventos";
import { listTemplates, type MessageTemplate } from "@/lib/data/templates";
import { AssistenteIaSequencia, type RascunhoSequencia } from "./assistente-ia";
import { MarcaEva } from "@/components/layout/marca-eva";

// ---------------------------------------------------------------------------
// Sequências (réguas). v5: uma pergunta por tela — a régua está rodando?
// Números do agente no topo e, em cada linha, canal, nome, quantos estão na
// régua agora e o liga/desliga. Gatilho, passos, regras, "Ajustar com IA" e
// Apagar moram no detalhe, que abre numa gaveta ao clicar na linha.
// ---------------------------------------------------------------------------

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
  email: "E-mail",
};

// Ícone do canal na linha: o canal é identidade, então é o único lugar com cor.
const CHANNEL_ICON: Record<string, { Icone: LucideIcon; cor: string }> = {
  whatsapp_meta: { Icone: MessageCircle, cor: "text-success" },
  whatsapp_qr: { Icone: MessageCircle, cor: "text-success" },
  telegram: { Icone: Send, cor: "text-info" },
  instagram: { Icone: AtSign, cor: "text-text-secondary" },
  email: { Icone: Mail, cor: "text-text-secondary" },
};

const TRIGGER_LABEL: Record<string, string> = {
  tag: "Ao receber etiqueta",
  segment: "Ao entrar no segmento",
  stage: "Por etapa do funil",
  manual: "Inscrição manual",
};

const AJUDA_DA_REGUA =
  "Régua de acompanhamento: mensagens com espera entre elas. O contato entra sozinho ao receber uma etiqueta e sai sozinho ao responder.";

/** "Ao receber etiqueta “Orçamento”": o gatilho numa frase, para o resumo do detalhe. */
function fraseDoGatilho(s: Sequence): string {
  let f = TRIGGER_LABEL[s.trigger] ?? s.trigger;
  if (s.trigger === "tag" && s.triggerTag) f += ` “${s.triggerTag.name}”`;
  if (s.trigger === "segment" && s.triggerSegment) f += ` “${s.triggerSegment.name}”`;
  if (s.trigger === "stage" && s.triggerStage)
    f += ` “${s.triggerStage.name}”${s.triggerStageDays > 0 ? ` parado há ${s.triggerStageDays}d` : ""}`;
  return f;
}

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
    <div className="grid grid-cols-[1fr_120px] gap-3 sm:grid-cols-[1fr_140px] sm:gap-4">
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
        <p className="mt-1 text-caption text-text-tertiary">dias. 0 = na hora</p>
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

/**
 * Rascunho da IA no formato que o editor entende. id vazio = régua ainda não
 * criada: o Salvar do editor cria (POST) e depois grava os passos (PATCH).
 */
function sequenciaDoRascunho(
  r: RascunhoSequencia,
  pipelines: PipelineRow[],
  tags: TagRow[],
  segments: SegmentRow[],
): Sequence {
  const pipe = pipelines.find((p) => p.stages.some((s) => s.id === r.triggerStageId));
  const stage = pipe?.stages.find((s) => s.id === r.triggerStageId);
  const tag = tags.find((t) => t.id === r.triggerTagId);
  const seg = segments.find((s) => s.id === r.triggerSegmentId);
  return {
    id: "",
    name: r.name,
    channel: r.channel,
    active: false,
    trigger: r.trigger,
    triggerTag: tag ? { id: tag.id, name: tag.name } : null,
    triggerSegment: seg ? { id: seg.id, name: seg.name } : null,
    triggerStage: stage && pipe ? { id: stage.id, name: stage.name, pipeline: pipe.name } : null,
    triggerStageDays: r.triggerStageDays,
    allowReentry: r.allowReentry,
    stopOnReply: r.stopOnReply,
    totalEnrollments: 0,
    activeEnrollments: 0,
    steps: r.steps.map((s, i) => ({ ...s, order: i + 1 })),
  };
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

/** Número do topo: rótulo pequeno em cima, número grande sem ícone. */
function Numero({ rotulo, valor, apoio }: { rotulo: string; valor: React.ReactNode; apoio?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[18px] border border-border-subtle bg-panel px-4 py-3 sm:px-5">
      <span className="truncate text-small text-text-secondary">{rotulo}</span>
      <span className="flex items-baseline gap-1.5 text-display font-medium tabular-nums tracking-tight text-text-primary">
        {valor}
        {apoio && <span className="font-mono text-caption font-normal tracking-normal text-text-tertiary">{apoio}</span>}
      </span>
    </div>
  );
}

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
  const [showIa, setShowIa] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Só para o esqueleto: até a primeira resposta, a lista vazia não é "nenhuma sequência".
  const [carregou, setCarregou] = React.useState(false);

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

  React.useEffect(() => {
    if (!agentId) return;
    refresh().finally(() => setCarregou(true));
  }, [refresh, agentId]);

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
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">Sequências</h1>
        <EmptyState
          icon={<Repeat />}
          title="Nenhum agente ainda"
          description="Sequências mandam mensagens de acompanhamento em nome de um agente. Crie um agente primeiro."
        />
      </div>
    );
  }

  const agente = agents.find((a) => a.id === agentId);
  const naRegua = sequences.reduce((t, s) => t + s.activeEnrollments, 0);
  const inscritos = sequences.reduce((t, s) => t + s.totalEnrollments, 0);
  const ligadas = sequences.filter((s) => s.active).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
      {/* Barra da tela: título, agente e, à direita, ajuda, "Criar com IA" e a ação principal. */}
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">Sequências</h1>
        {carregou && (
          <span className="font-mono text-caption tabular-nums text-text-tertiary">
            {sequences.length} {sequences.length === 1 ? "régua" : "réguas"}
          </span>
        )}
        <span aria-hidden="true" className="h-5 w-px bg-border-subtle" />
        {agents.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" aria-label={`Agente: ${agente?.name ?? ""}. Trocar de agente`} className="max-w-[220px] px-2 text-text-primary">
                <span aria-hidden="true" className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-raised font-mono text-caption text-text-secondary">
                  {(agente?.name ?? "?").charAt(0).toUpperCase()}
                </span>
                <span className="truncate">{agente?.name ?? "Agente"}</span>
                <ChevronsUpDown size={14} aria-hidden="true" className="text-text-tertiary" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-56">
              <DropdownMenuLabel>Agentes</DropdownMenuLabel>
              {agents.map((a) => (
                <DropdownMenuCheckboxItem key={a.id} checked={a.id === agentId} onCheckedChange={() => setAgentId(a.id)}>
                  {a.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="ml-auto flex items-center gap-2">
          <IconButton aria-label="Como funcionam as sequências" tooltip={AJUDA_DA_REGUA}>
            <CircleHelp />
          </IconButton>
          <Button variant="secondary" onClick={() => setShowIa(true)} disabled={!agentId}>
            <MarcaEva size={14} className="shrink-0" /> Criar com IA
          </Button>
          <Button variant="primary" onClick={() => setShowNew(true)}>
            <Plus size={14} aria-hidden="true" /> Nova sequência
          </Button>
        </div>
      </div>

      {error && (
        <Notice tone="danger" onDismiss={() => setError(null)}>
          {error}
        </Notice>
      )}

      {!carregou ? (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label="Carregando sequências">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[84px] animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none" />
            ))}
          </div>
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none" />
          ))}
        </div>
      ) : sequences.length === 0 ? (
        <EmptyState
          icon={<Repeat />}
          title="Nenhuma sequência ainda"
          description="Ex.: quem pediu orçamento e não respondeu recebe uma lembrança em 1 dia e outra em 3."
          action={
            <Button variant="primary" onClick={() => setShowNew(true)}>
              <Plus size={14} aria-hidden="true" /> Nova sequência
            </Button>
          }
        />
      ) : (
        <>
          {/* Os números que existem hoje na API: quem está na régua, quantos já entraram e quantas estão ligadas. */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <Numero rotulo="Na régua agora" valor={naRegua.toLocaleString("pt-BR")} />
            <Numero rotulo="Inscritos" valor={inscritos.toLocaleString("pt-BR")} />
            <Numero rotulo="Ligadas" valor={ligadas} apoio={`de ${sequences.length}`} />
          </div>

          <ul aria-label="Sequências" className="flex flex-col">
            {sequences.map((s) => {
              const canal = CHANNEL_ICON[s.channel] ?? { Icone: Repeat, cor: "text-text-secondary" };
              return (
                <li
                  key={s.id}
                  className="flex h-[60px] items-center gap-3 border-b border-border-subtle px-2 transition-colors last:border-b-0 hover:bg-raised sm:gap-4"
                >
                  <button
                    type="button"
                    onClick={() => setEditing(s)}
                    className="flex h-full min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-accent-solid sm:gap-4"
                    aria-label={`Abrir ${s.name}`}
                  >
                    <span
                      title={CHANNEL_LABEL[s.channel] ?? s.channel}
                      className={cn("flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] border border-border-subtle bg-raised", canal.cor)}
                    >
                      <canal.Icone size={15} aria-hidden="true" />
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate text-body font-medium", s.active ? "text-text-primary" : "text-text-tertiary")}>
                      {s.name}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-1.5 whitespace-nowrap text-caption text-text-tertiary">
                      <span className={cn("text-body-lg font-semibold tabular-nums", s.active ? "text-text-primary" : "text-text-tertiary")}>
                        {s.activeEnrollments.toLocaleString("pt-BR")}
                      </span>
                      na régua
                    </span>
                  </button>
                  <Switch
                    checked={s.active}
                    onClick={(e) => pulsar(e.currentTarget, 1.2)}
                    onCheckedChange={() => toggleActive(s)}
                    aria-label={s.active ? `Desligar ${s.name}` : `Ligar ${s.name}`}
                  />
                </li>
              );
            })}
          </ul>
        </>
      )}

      {showIa && agentId && (
        <AssistenteIaSequencia
          agentId={agentId}
          catalogo={{ tags, segments, pipelines, templates }}
          onClose={() => setShowIa(false)}
          onUsar={(r) => {
            // Abre o editor com o rascunho; nada é gravado até "Salvar".
            setShowIa(false);
            setEditing(sequenciaDoRascunho(r, pipelines, tags, segments));
          }}
        />
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
          onRemove={(id) => { setEditing(null); remove(id); }}
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
      <ModalContent
        title="Nova sequência"
        description="Depois de criar, você adiciona os passos e liga a régua."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" onClick={save} disabled={saving || !name.trim()} loading={saving}>
              Criar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="ns-nome">Nome</Label>
            <Input id="ns-nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: follow-up de orçamento" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="ns-canal">Canal</Label>
              <Select id="ns-canal" value={channel} onChange={(e) => setChannel(e.target.value)}>
                <option value="whatsapp_meta">WhatsApp (oficial)</option>
                <option value="whatsapp_qr">WhatsApp (QR)</option>
                <option value="telegram">Telegram</option>
                <option value="instagram">Instagram</option>
                <option value="email">E-mail</option>
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
            <Notice tone="info">
              No Instagram a Meta só permite mensagem automatizada dentro de 24h da última mensagem da pessoa. Passos
              marcados para depois disso não serão entregues.
            </Notice>
          )}
        </div>
      </ModalContent>
    </Modal>
  );
}

function SequenceEditor({
  agentId, sequence, tags, segments, pipelines, templates, onClose, onSaved, onRemove, onError,
}: {
  agentId: string;
  sequence: Sequence;
  tags: TagRow[];
  segments: SegmentRow[];
  pipelines: PipelineRow[];
  templates: MessageTemplate[];
  onClose: () => void;
  onSaved: () => void;
  onRemove: (id: string) => void;
  onError: (e: string | null) => void;
}) {
  const [name, setName] = React.useState(sequence.name);
  const [channel, setChannel] = React.useState(sequence.channel);
  // Régua de e-mail: cada passo é um modelo de e-mail da Biblioteca.
  const [modelosDeEmail, setModelosDeEmail] = React.useState<{ id: string; nome: string }[] | null>(null);
  React.useEffect(() => {
    if (channel !== "email" || modelosDeEmail) return;
    let vivo = true;
    void fetch("/api/email/modelos")
      .then((r) => r.json())
      .catch(() => ({ modelos: [] }))
      .then((d) => {
        if (vivo) setModelosDeEmail(d.modelos ?? []);
      });
    return () => {
      vivo = false;
    };
  }, [channel, modelosDeEmail]);
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

  const [showIa, setShowIa] = React.useState(false);
  // Régua vinda de um rascunho da IA que ainda não existe no banco.
  const nova = sequence.id === "";
  // Se a criação deu certo e o PATCH dos passos falhou, o próximo Salvar
  // reaproveita a régua criada em vez de criar outra igual.
  const idCriado = React.useRef<string | null>(null);

  /** Estado atual do editor no formato do rascunho (para a IA ajustar). */
  function rascunhoAtual(): RascunhoSequencia {
    return {
      name, channel, trigger,
      triggerTagId: triggerTagId || null,
      triggerSegmentId: triggerSegmentId || null,
      triggerStageId: triggerStageId || null,
      triggerStageDays, stopOnReply, allowReentry,
      steps: steps.map((s, i) => ({ order: i + 1, delayMinutes: s.delayMinutes, text: s.text, templateId: s.templateId, applyTagId: s.applyTagId })),
    };
  }

  function usarRascunho(r: RascunhoSequencia) {
    setName(r.name);
    setChannel(r.channel);
    setTrigger(r.trigger);
    setTriggerTagId(r.triggerTagId ?? "");
    setTriggerSegmentId(r.triggerSegmentId ?? "");
    setTriggerStageId(r.triggerStageId ?? "");
    setTriggerStageDays(r.triggerStageDays);
    setStopOnReply(r.stopOnReply);
    setAllowReentry(r.allowReentry);
    setSteps(r.steps.map((s, i) => ({ ...s, order: i + 1 })));
    setShowIa(false);
  }

  async function save() {
    setSaving(true);
    onError(null);
    let id = idCriado.current ?? sequence.id;
    if (nova && !idCriado.current) {
      // Mesmo caminho do "Nova sequência": cria desligada e depois grava os passos.
      const criada = await fetch(`/api/agents/${agentId}/sequences`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, channel, trigger, triggerTagId, triggerSegmentId, triggerStageId, triggerStageDays, stopOnReply, allowReentry,
        }),
      });
      const data = await criada.json().catch(() => ({}));
      if (!criada.ok || !data.sequence?.id) {
        setSaving(false);
        onError(data.error ?? "Não foi possível criar a sequência.");
        return;
      }
      id = data.sequence.id;
      idCriado.current = id;
    }
    const res = await fetch(`/api/agents/${agentId}/sequences/${id}`, {
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

  const rotuloDoGrupo = "font-mono text-caption text-text-tertiary";

  return (
    <Drawer open onOpenChange={(open) => !open && onClose()}>
      <DrawerContent
        size="lg"
        title={nova ? "Revisar rascunho da IA" : sequence.name}
        description={
          nova
            ? "Confira os passos. A régua só é criada quando você clicar em Salvar, e nasce desligada."
            : `${CHANNEL_LABEL[sequence.channel] ?? sequence.channel} · ${fraseDoGatilho(sequence)}`
        }
        footer={
          <>
            {!nova && (
              <Button
                variant="ghost"
                className="mr-auto text-danger hover:bg-danger-subtle hover:text-danger"
                onClick={() => onRemove(sequence.id)}
                aria-label={`Apagar sequência ${sequence.name}`}
              >
                <Trash2 size={14} aria-hidden="true" /> Apagar
              </Button>
            )}
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button variant="primary" onClick={save} disabled={saving} loading={saving}>
              Salvar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-6">
          {/* Resumo: o que saiu da linha da lista (inscritos, na régua, passos). */}
          {!nova && (
            <div className="grid grid-cols-3 gap-2">
              {[
                { r: "Inscritos", v: sequence.totalEnrollments },
                { r: "Na régua agora", v: sequence.activeEnrollments },
                { r: "Passos", v: sequence.steps.length },
              ].map((n) => (
                <div key={n.r} className="flex min-w-0 flex-col gap-0.5 rounded-[14px] bg-raised px-3 py-2.5">
                  <span className="truncate text-caption text-text-tertiary">{n.r}</span>
                  <span className="text-title-sm font-semibold tabular-nums text-text-primary">{n.v.toLocaleString("pt-BR")}</span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <span className={rotuloDoGrupo}>Régua</span>
            <Button variant="secondary" size="sm" onClick={() => setShowIa(true)}>
              <MarcaEva size={13} className="shrink-0" /> {steps.length > 0 ? "Ajustar com IA" : "Criar com IA"}
            </Button>
          </div>
          {showIa && (
            <AssistenteIaSequencia
              agentId={agentId}
              catalogo={{ tags, segments, pipelines, templates }}
              atual={steps.length > 0 ? rascunhoAtual() : null}
              onClose={() => setShowIa(false)}
              onUsar={usarRascunho}
            />
          )}
          <div className="-mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                <option value="email">E-mail</option>
              </Select>
            </div>
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

          <div className="flex flex-col gap-2">
            <span className={rotuloDoGrupo}>Regras</span>
            <div className="flex flex-col rounded-[14px] bg-raised px-4">
              <label className="flex items-center justify-between gap-4 py-3">
                <span>
                  <span className="block text-small font-medium text-text-primary">Sair ao responder</span>
                  <span className="block text-caption text-text-tertiary">
                    Respondeu, a régua para. Deixar desligado transforma follow-up em insistência.
                  </span>
                </span>
                <Switch checked={stopOnReply} onCheckedChange={setStopOnReply} />
              </label>
              <label className="flex items-center justify-between gap-4 border-t border-border-subtle py-3">
                <span>
                  <span className="block text-small font-medium text-text-primary">Permitir entrar de novo</span>
                  <span className="block text-caption text-text-tertiary">
                    Quem já passou pela régua pode ser inscrito outra vez.
                  </span>
                </span>
                <Switch checked={allowReentry} onCheckedChange={setAllowReentry} />
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className={rotuloDoGrupo}>Passos · {steps.length}</span>
              <span className="text-caption text-text-tertiary">
                A espera de cada passo conta a partir do passo anterior.
              </span>
            </div>

            {steps.map((step, index) => (
              <div key={index} className="flex gap-3 rounded-[14px] bg-raised px-3 py-3 sm:px-4">
                <div className="flex flex-col items-center gap-1 pt-1.5 text-text-tertiary">
                  <GripVertical size={14} aria-hidden="true" />
                  <span className="font-mono text-caption tabular-nums">{index + 1}</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1 text-caption text-text-tertiary" aria-hidden="true">
                      <Clock size={12} /> {formatDelay(step.delayMinutes)}
                    </span>
                    <Select
                      aria-label={`Espera do passo ${index + 1}`}
                      className="w-full sm:w-[150px]"
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
                        aria-label={`Espera em minutos do passo ${index + 1}`}
                        className="w-full sm:w-[110px]"
                        type="number"
                        min={0}
                        value={step.delayMinutes}
                        onChange={(e) => updateStep(index, { delayMinutes: Number(e.target.value) })}
                      />
                    )}

                    {channel === "whatsapp_meta" && (
                      <Select
                        aria-label={`Modelo fora da janela do passo ${index + 1}`}
                        className="w-full sm:w-[220px]"
                        value={step.templateId ?? ""}
                        onChange={(e) => updateStep(index, { templateId: e.target.value || null })}
                      >
                        <option value="">Modelo fora da janela: nenhum</option>
                        {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </Select>
                    )}

                    <Select
                      aria-label={`Etiqueta ao entregar o passo ${index + 1}`}
                      className="w-full sm:w-[190px]"
                      value={step.applyTagId ?? ""}
                      onChange={(e) => updateStep(index, { applyTagId: e.target.value || null })}
                    >
                      <option value="">Sem etiqueta ao entregar</option>
                      {tags.map((t) => <option key={t.id} value={t.id}>Etiquetar: {t.name}</option>)}
                    </Select>

                    <IconButton
                      size="sm"
                      className="ml-auto hover:bg-danger-subtle hover:text-danger"
                      onClick={() => setSteps(steps.filter((_, i) => i !== index))}
                      aria-label="Remover passo"
                    >
                      <X />
                    </IconButton>
                  </div>

                  {channel === "email" ? (
                    <Select
                      aria-label={`Modelo de e-mail do passo ${index + 1}`}
                      value={step.templateId ?? ""}
                      onChange={(e) => {
                        const m = modelosDeEmail?.find((x) => x.id === e.target.value);
                        updateStep(index, { templateId: m?.id ?? null, text: m ? `E-mail: ${m.nome}` : "" });
                      }}
                    >
                      <option value="">Escolha o modelo de e-mail…</option>
                      {(modelosDeEmail ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                    </Select>
                  ) : (
                    <Textarea
                      aria-label={`Mensagem do passo ${index + 1}`}
                      rows={2}
                      value={step.text}
                      onChange={(e) => updateStep(index, { text: e.target.value })}
                      placeholder="Oi {nome}, vi que você pediu um orçamento. Ficou alguma dúvida?"
                    />
                  )}
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
              <Plus size={14} aria-hidden="true" /> Adicionar passo
            </Button>

            {channel === "email" && (
              <p className="text-caption text-text-tertiary">
                Cada passo manda um modelo da Biblioteca → Modelos de e-mail, pelo domínio do contrato. Quem não tem
                e-mail ou se descadastrou sai da régua com o motivo registrado.
              </p>
            )}
            {channel === "whatsapp_meta" && (
              <p className="text-caption text-text-tertiary">
                Passo que cair fora da janela de 24h precisa de um modelo aprovado. Sem ele, a régua desse contato para
                com o motivo registrado, em vez de tentar um envio que a Meta recusaria.
              </p>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
