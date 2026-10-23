"use client";

import * as React from "react";
import { ArrowRight, ChevronDown, CornerDownRight, Lightbulb, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ConfirmarExclusao } from "@/components/crm/config/confirmar-exclusao";
import { cn } from "@/lib/utils";
import { TriggerModal } from "./triggers/trigger-modal";
import {
  CHANNELS,
  IDEAS,
  KINDS,
  describeMatch,
  emptyDraft,
  timeAgo,
  type Draft,
  type FlowNodeOption,
  type Kind,
  type StoryOption,
  type Trigger,
} from "./triggers/trigger-kinds";

async function chamar(url: string, metodo: string, corpo?: unknown) {
  try {
    const res = await fetch(url, {
      method: metodo,
      headers: corpo ? { "Content-Type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    const dados = await res.json().catch(() => ({}));
    return { ok: res.ok, erro: res.ok ? null : ((dados.error as string) ?? "Algo deu errado. Tente de novo."), dados };
  } catch {
    return { ok: false, erro: "Sem conexão com o servidor. Tente de novo.", dados: {} };
  }
}

function paraRascunho(t: Trigger): Draft {
  return {
    name: t.name,
    kind: t.kind,
    channels: t.channels,
    matchMode: t.matchMode,
    keywords: t.keywords,
    storyId: t.storyId,
    includeReactions: t.includeReactions,
    replyText: t.replyText,
    targetNodeId: t.targetNodeId,
    priority: t.priority,
    active: t.active,
  };
}

const ROTULO_CANAL = new Map(CHANNELS.map((c) => [c.id, c.label]));

export function TriggersEditor({ agentId }: { agentId: string }) {
  const [triggers, setTriggers] = React.useState<Trigger[] | null>(null);
  const [nodes, setNodes] = React.useState<FlowNodeOption[]>([]);
  const [stories, setStories] = React.useState<StoryOption[]>([]);
  const [storiesReason, setStoriesReason] = React.useState<string | null>(null);
  const [storiesLoading, setStoriesLoading] = React.useState(false);
  const [editando, setEditando] = React.useState<{ id: string | null; draft: Draft } | null>(null);
  const [excluindo, setExcluindo] = React.useState<Trigger | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const storiesPedidos = React.useRef(false);

  const buscar = React.useCallback(async () => {
    const [t, f] = await Promise.all([
      chamar(`/api/agents/${agentId}/triggers`, "GET"),
      chamar(`/api/flows/${agentId}`, "GET"),
    ]);
    const flowNodes = ((f.dados as { flow?: { nodes?: unknown[] } }).flow?.nodes ?? []) as {
      id: string;
      data?: { label?: string; iconKey?: string };
    }[];
    return {
      erro: t.erro,
      triggers: ((t.dados as { triggers?: Trigger[] }).triggers ?? []) as Trigger[],
      nodes: flowNodes
        .filter((n) => n.data?.iconKey !== "start")
        .map((n) => ({ id: n.id, label: n.data?.label || n.data?.iconKey || "Bloco sem nome" })),
    };
  }, [agentId]);

  const recarregar = React.useCallback(async () => {
    const r = await buscar();
    setTriggers(r.triggers);
    setNodes(r.nodes);
    if (r.erro) setErro(r.erro);
  }, [buscar]);

  React.useEffect(() => {
    let vivo = true;
    buscar().then((r) => {
      if (!vivo) return;
      setTriggers(r.triggers);
      setNodes(r.nodes);
      if (r.erro) setErro(r.erro);
    });
    return () => {
      vivo = false;
    };
  }, [buscar]);

  async function carregarStories() {
    if (storiesPedidos.current) return;
    storiesPedidos.current = true;
    setStoriesLoading(true);
    const r = await chamar(`/api/agents/${agentId}/instagram-stories`, "GET");
    const dados = r.dados as { stories?: StoryOption[]; reason?: string };
    setStories(dados.stories ?? []);
    setStoriesReason(dados.reason ?? r.erro ?? null);
    setStoriesLoading(false);
  }

  function abrir(id: string | null, draft: Draft) {
    setErro(null);
    setEditando({ id, draft });
    if (draft.kind === "story_reply") void carregarStories();
  }

  async function salvar(draft: Draft): Promise<string | null> {
    const id = editando?.id;
    const r = await chamar(id ? `/api/agents/${agentId}/triggers/${id}` : `/api/agents/${agentId}/triggers`, id ? "PUT" : "POST", draft);
    if (!r.ok) return r.erro;
    setEditando(null);
    await recarregar();
    return null;
  }

  // Ligar/desligar direto na lista: muda na hora e desfaz se o servidor recusar.
  async function alternar(t: Trigger, active: boolean) {
    setTriggers((lista) => lista?.map((x) => (x.id === t.id ? { ...x, active } : x)) ?? null);
    const r = await chamar(`/api/agents/${agentId}/triggers/${t.id}`, "PUT", { ...paraRascunho(t), active });
    if (!r.ok) {
      setTriggers((lista) => lista?.map((x) => (x.id === t.id ? { ...x, active: t.active } : x)) ?? null);
      setErro(`Não foi possível ${active ? "ativar" : "pausar"} "${t.name}": ${r.erro}`);
    }
  }

  const nomeDoBloco = (id: string) => nodes.find((n) => n.id === id)?.label;

  if (triggers === null) {
    return (
      <div className="flex flex-col gap-2.5 p-1" aria-busy="true" aria-label="Carregando gatilhos">
        {[0, 1].map((i) => (
          <div key={i} className="h-[76px] animate-pulse rounded-[14px] bg-raised" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      {triggers.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-small text-text-tertiary">
            {triggers.filter((t) => t.active).length} de {triggers.length} ativos · sem gatilho, a mensagem segue o fluxo padrão.
          </p>
          <NovoGatilho onEscolher={(k) => abrir(null, emptyDraft(k))} />
        </div>
      )}

      {erro && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-2xl bg-danger-subtle px-4 py-3 text-small text-danger">
          <span>{erro}</span>
          <button type="button" onClick={() => setErro(null)} className="shrink-0 text-caption underline-offset-2 hover:underline">
            Fechar
          </button>
        </div>
      )}

      {triggers.length === 0 ? (
        <EstadoVazio onEscolher={(k) => abrir(null, emptyDraft(k))} onIdeia={(d) => abrir(null, d)} />
      ) : (
        <ul className="flex flex-col gap-2.5">
          {triggers.map((t) => {
            const meta = KINDS[t.kind];
            const Icon = meta.icon;
            const ultimo = timeAgo(t.lastTriggeredAt);
            const bloco = t.targetNodeId ? nomeDoBloco(t.targetNodeId) : null;
            return (
              <li
                key={t.id}
                className={cn(
                  "group flex flex-wrap items-start gap-3.5 rounded-[14px] bg-raised p-3.5 ring-1 ring-border-subtle transition-colors hover:ring-border-default sm:flex-nowrap",
                  !t.active && "opacity-60"
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl",
                    t.active ? "bg-accent-subtle text-accent-fg" : "bg-hover text-text-tertiary"
                  )}
                >
                  <Icon size={18} aria-hidden />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => abrir(t.id, paraRascunho(t))}
                      className="truncate text-left text-body font-medium text-text-primary outline-none hover:underline focus-visible:underline"
                    >
                      {t.name}
                    </button>
                    {!t.active && <Badge>Pausado</Badge>}
                  </div>
                  <p className="mt-0.5 text-caption text-text-tertiary">
                    {meta.short} · {describeMatch(t)}
                    {t.kind === "dm_keyword" &&
                      ` · ${t.channels.length === 0 ? "todos os canais" : t.channels.map((c) => ROTULO_CANAL.get(c) ?? c).join(", ")}`}
                  </p>

                  {t.keywords.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {t.keywords.slice(0, 5).map((k) => (
                        <span key={k} className="rounded-md bg-hover px-2 py-0.5 font-mono text-caption text-text-secondary">
                          {k}
                        </span>
                      ))}
                      {t.keywords.length > 5 && (
                        <span className="rounded-md px-1.5 py-0.5 text-caption text-text-tertiary">+{t.keywords.length - 5}</span>
                      )}
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-text-tertiary">
                    {t.replyText && (
                      <span className="flex min-w-0 max-w-full items-center gap-1.5">
                        <CornerDownRight size={13} aria-hidden className="shrink-0" />
                        <span className="truncate">{t.replyText}</span>
                      </span>
                    )}
                    {t.targetNodeId && (
                      <span className={cn("flex items-center gap-1.5", !bloco && "text-danger")}>
                        <ArrowRight size={13} aria-hidden />
                        {bloco ? `Segue para ${bloco}` : "Bloco de destino foi apagado"}
                      </span>
                    )}
                  </div>
                </div>

                {/* No celular vira uma faixa embaixo: contador à esquerda, ações à direita. */}
                <div className="flex w-full items-center justify-between gap-2 border-t border-border-subtle pt-2.5 sm:w-auto sm:shrink-0 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
                  <div className="order-last flex items-center gap-1 sm:order-first">
                    <Switch
                      checked={t.active}
                      onCheckedChange={(v) => alternar(t, v)}
                      aria-label={t.active ? `Pausar ${t.name}` : `Ativar ${t.name}`}
                    />
                    <button
                      type="button"
                      onClick={() => abrir(t.id, paraRascunho(t))}
                      aria-label={`Editar ${t.name}`}
                      className="ml-1 grid h-9 w-9 place-items-center rounded-lg text-text-tertiary outline-none hover:bg-hover hover:text-text-primary focus-visible:ring-2 focus-visible:ring-focus"
                    >
                      <Pencil size={15} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcluindo(t)}
                      aria-label={`Excluir ${t.name}`}
                      className="grid h-9 w-9 place-items-center rounded-lg text-text-tertiary outline-none hover:bg-danger-subtle hover:text-danger focus-visible:ring-2 focus-visible:ring-danger/60"
                    >
                      <Trash2 size={15} aria-hidden />
                    </button>
                  </div>
                  <p className="text-caption tabular-nums text-text-tertiary sm:text-right">
                    <span className="font-medium text-text-secondary">{t.triggerCount.toLocaleString("pt-BR")}</span>{" "}
                    {t.triggerCount === 1 ? "disparo" : "disparos"}
                    {ultimo && <span className="sm:block"><span className="sm:hidden"> · </span>último {ultimo}</span>}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editando && (
        <TriggerModal
          initial={editando.draft}
          editing={!!editando.id}
          nodes={nodes}
          stories={stories}
          storiesLoading={storiesLoading}
          storiesReason={storiesReason}
          onClose={() => setEditando(null)}
          onSave={salvar}
        />
      )}

      {excluindo && (
        <ConfirmarExclusao
          titulo={`Excluir "${excluindo.name}"?`}
          descricao={`${
            excluindo.triggerCount === 0
              ? "Ele ainda não disparou nenhuma vez."
              : `Ele já disparou ${excluindo.triggerCount.toLocaleString("pt-BR")} ${excluindo.triggerCount === 1 ? "vez" : "vezes"}.`
          } Se só quer parar por um tempo, pause em vez de excluir.`}
          onCancelar={() => setExcluindo(null)}
          onConfirmar={async () => {
            const r = await chamar(`/api/agents/${agentId}/triggers/${excluindo.id}`, "DELETE");
            if (!r.ok) return r.erro;
            setExcluindo(null);
            await recarregar();
            return null;
          }}
        />
      )}
    </div>
  );
}

function NovoGatilho({ onEscolher }: { onEscolher: (k: Kind) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Plus size={15} aria-hidden /> Novo gatilho <ChevronDown size={14} aria-hidden className="opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      {/* O menu devolveria o foco ao botão por cima do modal que acabou de abrir. */}
      <DropdownMenuContent align="end" className="w-[300px]" onCloseAutoFocus={(e) => e.preventDefault()}>
        {(Object.keys(KINDS) as Kind[]).map((k) => {
          const Icon = KINDS[k].icon;
          return (
            <DropdownMenuItem key={k} onSelect={() => onEscolher(k)} className="items-start">
              <Icon size={16} aria-hidden className="mt-0.5 shrink-0 text-text-tertiary" />
              <span>
                <span className="block text-small font-medium text-text-primary">{KINDS[k].label}</span>
                <span className="block text-caption leading-snug text-text-tertiary">{KINDS[k].description}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EstadoVazio({ onEscolher, onIdeia }: { onEscolher: (k: Kind) => void; onIdeia: (d: Draft) => void }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start gap-3 rounded-[14px] bg-raised/60 p-4 ring-1 ring-border-subtle">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] bg-raised text-text-secondary">
          <Zap size={16} aria-hidden />
        </span>
        <p className="text-small leading-relaxed text-text-secondary">
          Nenhum gatilho ainda. Sem gatilho, toda mensagem segue o fluxo padrão do agente. Com eles, uma palavra, uma resposta a
          story ou uma menção já leva a pessoa direto para a resposta certa.
        </p>
      </div>

      <div className="grid gap-2.5 sm:grid-cols-3">
        {(Object.keys(KINDS) as Kind[]).map((k) => {
          const Icon = KINDS[k].icon;
          return (
            <button
              key={k}
              type="button"
              onClick={() => onEscolher(k)}
              className="group flex flex-col items-start gap-3 rounded-[14px] bg-raised p-4 text-left ring-1 ring-border-subtle outline-none transition hover:-translate-y-0.5 hover:ring-accent-solid/40 focus-visible:ring-2 focus-visible:ring-focus motion-reduce:transition-none motion-reduce:hover:translate-y-0"
            >
              <span className="grid h-10 w-10 place-items-center rounded-[11px] bg-raised text-text-secondary">
                <Icon size={18} aria-hidden />
              </span>
              <span>
                <span className="flex items-center gap-1.5 text-small font-medium text-text-primary">
                  {KINDS[k].short}
                  <ArrowRight size={13} aria-hidden className="opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
                <span className="mt-1 block text-caption leading-snug text-text-tertiary">{KINDS[k].description}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div>
        <p className="mb-2 flex items-center gap-1.5 text-small text-text-tertiary">
          <Lightbulb size={13} aria-hidden /> Ideias para começar
        </p>
        <div className="flex flex-wrap gap-2">
          {IDEAS.map((i) => (
            <button
              key={i.label}
              type="button"
              onClick={() => onIdeia(i.draft)}
              className="min-h-9 rounded-full bg-raised px-3.5 text-small text-text-secondary ring-1 ring-border-subtle outline-none hover:text-text-primary hover:ring-border-default focus-visible:ring-2 focus-visible:ring-focus"
            >
              + {i.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
