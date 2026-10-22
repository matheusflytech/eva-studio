"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TRIGGER_LIMITS } from "@/lib/server/triggers";
import { cn } from "@/lib/utils";
import { ChannelChips, Field, KeywordInput, ReplyPreview, Segmented, StoryPicker, describedBy } from "./trigger-fields";
import { CHANNELS, KINDS, type Draft, type FlowNodeOption, type Mode, type StoryOption } from "./trigger-kinds";

type Erros = Partial<Record<"name" | "keywords" | "replyText" | "storyId" | "geral", string>>;

/** Mesmas regras do servidor, rodando antes do envio — o servidor continua sendo quem decide. */
function validar(d: Draft): Erros {
  const e: Erros = {};
  if (!d.name.trim()) e.name = "Dê um nome para encontrar este gatilho depois.";
  else if (d.name.length > TRIGGER_LIMITS.name) e.name = `Até ${TRIGGER_LIMITS.name} caracteres.`;
  if (d.matchMode !== "any" && d.keywords.length === 0) e.keywords = "Adicione ao menos uma palavra.";
  if (d.replyText.length > TRIGGER_LIMITS.replyText) e.replyText = `Até ${TRIGGER_LIMITS.replyText} caracteres.`;
  else if (!d.replyText.trim() && !d.targetNodeId) e.replyText = "Escreva uma resposta ou escolha um bloco do fluxo para seguir.";
  if (d.storyId && !/^[\w-]{1,64}$/.test(d.storyId)) e.storyId = "Use só o ID do story (letras, números, _ e -).";
  return e;
}

/** Erro do servidor volta para o campo certo quando dá pra saber qual é. */
function erroDoServidor(msg: string): Erros {
  const m = msg.toLowerCase();
  if (m.includes("nome")) return { name: msg };
  if (m.includes("palavra")) return { keywords: msg };
  if (m.includes("resposta") || m.includes("bloco")) return { replyText: msg };
  if (m.includes("story")) return { storyId: msg };
  return { geral: msg };
}

const MODES_DM: { value: Mode; label: string; hint: string }[] = [
  { value: "contains", label: "Contém a palavra", hint: "“quero a promo” dispara com promo" },
  { value: "exact", label: "Texto exato", hint: "Só dispara se a mensagem for a palavra" },
];
const MODES_STORY: { value: Mode; label: string; hint: string }[] = [
  { value: "any", label: "Qualquer resposta", hint: "Toda resposta ao story" },
  ...MODES_DM,
];

export function TriggerModal({
  initial,
  editing,
  nodes,
  stories,
  storiesLoading,
  storiesReason,
  onClose,
  onSave,
}: {
  initial: Draft;
  editing: boolean;
  nodes: FlowNodeOption[];
  stories: StoryOption[];
  storiesLoading: boolean;
  storiesReason: string | null;
  onClose: () => void;
  onSave: (d: Draft) => Promise<string | null>;
}) {
  const [d, setD] = React.useState<Draft>(initial);
  const [erros, setErros] = React.useState<Erros>({});
  const [tentou, setTentou] = React.useState(false);
  const [salvando, setSalvando] = React.useState(false);
  const meta = KINDS[d.kind];
  const Icon = meta.icon;
  const nomeRef = React.useRef<HTMLInputElement>(null);

  // O Dialog foca o primeiro botão (o X) ao abrir; o lugar certo é o nome.
  // Roda depois do foco automático dele, por isso o setTimeout.
  React.useEffect(() => {
    const t = window.setTimeout(() => nomeRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, []);

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    const prox = { ...d, [k]: v };
    setD(prox);
    if (tentou) setErros(validar(prox));
  }

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setTentou(true);
    const v = validar(d);
    setErros(v);
    if (Object.keys(v).length > 0) {
      const primeiro = Object.keys(v)[0];
      document.getElementById(`gatilho-${primeiro === "storyId" ? "story-id" : primeiro}`)?.focus();
      return;
    }
    setSalvando(true);
    const erro = await onSave({ ...d, name: d.name.trim(), replyText: d.replyText.trim() });
    setSalvando(false);
    if (erro) setErros(erroDoServidor(erro));
  }

  const restante = TRIGGER_LIMITS.replyText - d.replyText.length;

  return (
    <Modal open onOpenChange={(o) => !o && !salvando && onClose()}>
      <ModalContent
        title={editing ? "Editar gatilho" : "Novo gatilho"}
        description={meta.description}
        className="max-h-[92dvh] max-w-2xl overflow-y-auto p-6 sm:p-7"
      >
        <form onSubmit={salvar} noValidate className="flex flex-col gap-6">
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3 ring-1 ring-border-subtle">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-400">
              <Icon size={18} aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-[13.5px] font-medium text-text-primary">{meta.label}</p>
              <p className="text-[12px] text-text-tertiary">
                {d.kind === "dm_keyword" ? "Vale para os canais que você escolher." : "Só no Instagram."}
              </p>
            </div>
          </div>

          <Field id="gatilho-name" label="Nome" error={erros.name} hint="Só você vê. Ex.: Cupom da Black Friday">
            <Input
              ref={nomeRef}
              id="gatilho-name"
              value={d.name}
              maxLength={TRIGGER_LIMITS.name}
              aria-invalid={!!erros.name || undefined}
              aria-describedby={describedBy("gatilho-name", erros.name, true)}
              className={cn(erros.name && "border-danger/60")}
              onChange={(e) => set("name", e.target.value)}
            />
          </Field>

          {/* ---------- Quando dispara ---------- */}
          <section className="flex flex-col gap-4" aria-labelledby="gatilho-quando">
            <h3 id="gatilho-quando" className="font-display text-[15px] font-semibold text-text-primary">
              Quando dispara
            </h3>

            {d.kind === "story_reply" && (
              <Field id="gatilho-story" label="Em qual story">
                <StoryPicker
                  stories={stories}
                  loading={storiesLoading}
                  reason={storiesReason}
                  value={d.storyId}
                  onChange={(v) => set("storyId", v)}
                  error={erros.storyId}
                />
                <p className="mt-2 text-[12px] text-text-tertiary">Story some em 24h. Depois disso, um gatilho de story específico para de disparar.</p>
              </Field>
            )}

            {d.kind === "story_mention" && (
              <p className="rounded-xl bg-surface-2 px-4 py-3 text-[13px] leading-relaxed text-text-secondary ring-1 ring-border-subtle">
                Toda vez que alguém marcar a sua conta num story. A mídia do story fica salva na conversa, porque o link da
                Meta expira em poucas horas.
              </p>
            )}

            {d.kind !== "story_mention" && (
              <Segmented
                label="Como comparar a mensagem"
                value={d.matchMode}
                options={d.kind === "story_reply" ? MODES_STORY : MODES_DM}
                onChange={(v) => set("matchMode", v)}
              />
            )}

            {d.matchMode !== "any" && d.kind !== "story_mention" && (
              <Field
                id="gatilho-keywords"
                label="Palavras"
                error={erros.keywords}
                hint="Maiúscula e acento não importam: “Promoção” também pega “promocao”."
              >
                <KeywordInput
                  id="gatilho-keywords"
                  value={d.keywords}
                  onChange={(v) => set("keywords", v)}
                  invalid={!!erros.keywords}
                  describedById={describedBy("gatilho-keywords", erros.keywords, true)}
                />
              </Field>
            )}

            {d.kind === "story_reply" && (
              <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl bg-surface-2 px-4 py-3 ring-1 ring-border-subtle">
                <span>
                  <span className="block text-[13px] font-medium text-text-primary">Responder reações com emoji</span>
                  <span className="block text-[12px] text-text-tertiary">Quando alguém só reage ao story com um emoji, sem escrever nada.</span>
                </span>
                <Switch checked={d.includeReactions} onCheckedChange={(v) => set("includeReactions", v)} aria-label="Responder reações com emoji" />
              </label>
            )}

            {d.kind === "dm_keyword" && (
              <Field id="gatilho-canais" label="Em quais canais">
                <ChannelChips value={d.channels} options={CHANNELS} onChange={(v) => set("channels", v)} />
              </Field>
            )}
          </section>

          {/* ---------- O que acontece ---------- */}
          <section className="flex flex-col gap-4" aria-labelledby="gatilho-acao">
            <h3 id="gatilho-acao" className="font-display text-[15px] font-semibold text-text-primary">
              O que acontece
            </h3>
            <div className="grid gap-4 md:grid-cols-[1fr_minmax(0,0.85fr)]">
              <Field
                id="gatilho-replyText"
                label="Resposta"
                error={erros.replyText}
                hint={<>Pode ter cupom, link e variáveis como {"{nome}"}.</>}
                aside={
                  <span className={cn("text-[11.5px] tabular-nums", restante < 100 ? "text-danger" : "text-text-tertiary")} aria-live="polite">
                    {restante}
                  </span>
                }
              >
                <Textarea
                  id="gatilho-replyText"
                  rows={5}
                  value={d.replyText}
                  maxLength={TRIGGER_LIMITS.replyText}
                  aria-invalid={!!erros.replyText || undefined}
                  aria-describedby={describedBy("gatilho-replyText", erros.replyText, true)}
                  className={cn("min-h-[132px]", erros.replyText && "border-danger/60")}
                  onChange={(e) => set("replyText", e.target.value)}
                />
              </Field>
              <ReplyPreview text={d.replyText} kind={d.kind} />
            </div>

            <Field
              id="gatilho-destino"
              label="Depois da resposta"
              hint={nodes.length === 0 ? "Este agente ainda não tem fluxo salvo: só a resposta será enviada." : "Seguir para um bloco tira a conversa de onde ela estava e continua dali."}
            >
              <Select
                id="gatilho-destino"
                value={d.targetNodeId}
                disabled={nodes.length === 0}
                onChange={(e) => set("targetNodeId", e.target.value)}
              >
                <option value="">Deixar a conversa onde está</option>
                {nodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    Seguir para: {n.label}
                  </option>
                ))}
              </Select>
            </Field>
          </section>

          {erros.geral && (
            <div role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-[13px] text-danger">
              {erros.geral}
            </div>
          )}

          <div className="sticky -bottom-6 -mx-6 -mb-6 flex flex-wrap items-center justify-between gap-3 rounded-b-3xl border-t border-border-subtle bg-surface-1 px-6 py-4 sm:-bottom-7 sm:-mx-7 sm:-mb-7 sm:px-7">
            <label className="flex cursor-pointer items-center gap-2.5 text-[13px] text-text-secondary">
              <Switch checked={d.active} onCheckedChange={(v) => set("active", v)} aria-label="Gatilho ativo" />
              {d.active ? "Ativo" : "Pausado"}
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={onClose} disabled={salvando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvando}>
                {salvando && <Loader2 size={15} className="animate-spin" aria-hidden />}
                {editing ? "Salvar alterações" : "Criar gatilho"}
              </Button>
            </div>
          </div>
        </form>
      </ModalContent>
    </Modal>
  );
}
