"use client";

import * as React from "react";
import Link from "next/link";
import { Handshake, Plus, Loader2, X, SlidersHorizontal, Search, Columns3, Rows3, Hourglass } from "lucide-react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalContent } from "@/components/ui/modal";
import { DealDrawer } from "@/components/crm/deal-drawer";
import { cn } from "@/lib/utils";
import { CamposDoFormulario, rascunhoParaEnvio, type Rascunho } from "@/components/crm/campos-personalizados";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { DealCard } from "@/components/crm/negocios/deal-card";
import { StageColumn } from "@/components/crm/negocios/stage-column";
import { ListView } from "@/components/crm/negocios/list-view";
import { ResumoDoFunilView } from "@/components/crm/negocios/resumo";
import {
  filtrarEtapas,
  resumoDoFunil,
  type EtapaKanban,
  type FiltrosDeNegocio,
  type NegocioKanban,
} from "@/components/crm/negocios/modelo";

interface PipelineOption {
  id: string;
  name: string;
  stages: { id: string; name: string; type: string }[];
}

type Visao = "kanban" | "lista";
const CHAVE_VISAO = "eva:negocios:visao";
const EVENTO_VISAO = "eva:negocios:visao";
// Navegador sem armazenamento: a escolha vale só enquanto a página está aberta.
let visaoEmMemoria: Visao = "kanban";

function lerVisao(): Visao {
  try {
    const salva = localStorage.getItem(CHAVE_VISAO);
    if (salva === "lista" || salva === "kanban") return salva;
  } catch {
    // sem armazenamento
  }
  return visaoEmMemoria;
}

function gravarVisao(v: Visao) {
  visaoEmMemoria = v;
  try {
    localStorage.setItem(CHAVE_VISAO, v);
  } catch {
    // sem armazenamento: fica em memória
  }
  window.dispatchEvent(new Event(EVENTO_VISAO));
}

function assinarVisao(avisar: () => void) {
  window.addEventListener(EVENTO_VISAO, avisar);
  window.addEventListener("storage", avisar);
  return () => {
    window.removeEventListener(EVENTO_VISAO, avisar);
    window.removeEventListener("storage", avisar);
  };
}

export default function NegociosPage() {
  const [pipelines, setPipelines] = React.useState<PipelineOption[]>([]);
  const [pipelineId, setPipelineId] = React.useState("");
  const [stages, setStages] = React.useState<EtapaKanban[]>([]);
  const [defs, setDefs] = React.useState<DefinicaoDeCampo[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [novoNaEtapa, setNovoNaEtapa] = React.useState<string | null>(null);
  const [openDealId, setOpenDealId] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState<{ deal: NegocioKanban; tipo: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filtros, setFiltros] = React.useState<FiltrosDeNegocio>({});
  // Kanban ou lista, lembrado entre visitas (no servidor sempre começa kanban).
  const visao = React.useSyncExternalStore(assinarVisao, lerVisao, () => "kanban" as Visao);
  const trocarVisao = gravarVisao;
  // Relógio da tela: muda só quando os dados chegam (dias parados, atrasos).
  const [agora, setAgora] = React.useState(() => new Date());

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    // Teclado: espaço pega, setas movem, espaço solta (Enter fica para abrir).
    useSensor(KeyboardSensor, { keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] } })
  );

  React.useEffect(() => {
    fetch("/api/pipelines")
      .then((r) => r.json())
      .then((d) => {
        setPipelines(d.pipelines ?? []);
        if (d.pipelines?.[0]) setPipelineId((prev) => prev || d.pipelines[0].id);
      })
      .catch(() => setPipelines([]));
  }, []);

  const refresh = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/deals${pipelineId ? `?pipeline=${pipelineId}` : ""}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar os negócios.");
      setStages(data.stages ?? []);
      setDefs(data.fields ?? []);
      setAgora(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível carregar os negócios.");
    } finally {
      setIsLoading(false);
    }
  }, [pipelineId]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const visiveis = React.useMemo(() => filtrarEtapas(stages, filtros, agora), [stages, filtros, agora]);
  const resumo = React.useMemo(() => resumoDoFunil(stages, agora), [stages, agora]);
  const donos = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stages) for (const d of s.deals) if (d.owner) m.set(d.owner.id, d.owner.name || "Sem nome");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [stages]);
  const maiorTotalAberto = Math.max(0, ...visiveis.filter((s) => s.type === "open").map((s) => s.totalCents));
  const filtrando = !!(filtros.busca?.trim() || filtros.dono || filtros.soParados);
  const totalVisivel = visiveis.reduce((s, e) => s + e.deals.length, 0);

  function handleDragStart(event: DragStartEvent) {
    for (const s of stages) {
      const deal = s.deals.find((d) => d.id === event.active.id);
      if (deal) return setDragging({ deal, tipo: s.type });
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDragging(null);
    const dealId = String(event.active.id);
    const stageId = event.over ? String(event.over.id) : "";
    if (!stageId) return;

    const from = stages.find((s) => s.deals.some((d) => d.id === dealId));
    if (!from || from.id === stageId) return;

    // Move na tela antes da resposta: esperar o servidor para ver o card mudar
    // de coluna é o que faz kanban parecer lento.
    const deal = from.deals.find((d) => d.id === dealId)!;
    setStages((prev) =>
      prev.map((s) => {
        if (s.id === from.id) return { ...s, deals: s.deals.filter((d) => d.id !== dealId) };
        if (s.id === stageId) return { ...s, deals: [{ ...deal, stageSince: new Date().toISOString() }, ...s.deals] };
        return s;
      })
    );

    const res = await fetch(`/api/deals/${dealId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    }).catch(() => null);
    if (!res?.ok) setError(`Não foi possível mover "${deal.name}". A tela voltou ao estado salvo.`);
    // Recarrega de qualquer forma: totais, chance e ordem mudaram.
    refresh();
  }

  return (
    <div className="flex min-h-0 flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-semibold text-text-primary">Negócios</h1>
            {pipelines.length > 1 && (
              <div className="w-[190px]">
                <label htmlFor="pipeline" className="sr-only">
                  Funil
                </label>
                <Select id="pipeline" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} className="h-9">
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
          </div>
          <p className="mt-1 text-[13.5px] text-text-secondary">Arraste os cartões entre as etapas. Clique para ver detalhes.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/negocios/configurar"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-3.5 text-[13px] font-medium text-text-secondary ring-1 ring-border-subtle outline-none transition-colors hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60"
          >
            <SlidersHorizontal size={15} aria-hidden /> Personalizar
          </Link>
          <Button onClick={() => setNovoNaEtapa("")}>
            <Plus size={15} aria-hidden /> Novo negócio
          </Button>
        </div>
      </header>

      <ResumoDoFunilView
        resumo={resumo}
        soParados={!!filtros.soParados}
        onAlternarParados={() => setFiltros((f) => ({ ...f, soParados: !f.soParados }))}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-[1_1_240px] sm:max-w-[340px]">
          <Search size={15} aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <label htmlFor="busca-negocio" className="sr-only">
            Buscar negócio
          </label>
          <Input
            id="busca-negocio"
            value={filtros.busca ?? ""}
            onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
            placeholder="Buscar por negócio, empresa ou contato"
            className="h-10 pl-9"
          />
        </div>
        <div className="w-[190px]">
          <label htmlFor="filtro-dono" className="sr-only">
            Responsável
          </label>
          <Select
            id="filtro-dono"
            value={filtros.dono ?? ""}
            onChange={(e) => setFiltros((f) => ({ ...f, dono: e.target.value || undefined }))}
            className="h-10"
          >
            <option value="">Todos os responsáveis</option>
            {donos.map(([id, nome]) => (
              <option key={id} value={id}>
                {nome}
              </option>
            ))}
            <option value="__sem">Sem responsável</option>
          </Select>
        </div>
        <button
          type="button"
          aria-pressed={!!filtros.soParados}
          onClick={() => setFiltros((f) => ({ ...f, soParados: !f.soParados }))}
          className={cn(
            "inline-flex h-10 items-center gap-1.5 rounded-xl px-3.5 text-[13px] font-medium ring-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-500/60",
            filtros.soParados
              ? "bg-amber-400/12 text-amber-300 ring-amber-400/40"
              : "bg-surface-2 text-text-secondary ring-border-subtle hover:text-text-primary"
          )}
        >
          <Hourglass size={14} aria-hidden /> Parados
          {resumo.parados > 0 && <span className="tabular-nums opacity-80">{resumo.parados}</span>}
        </button>
        {filtrando && (
          <button
            type="button"
            onClick={() => setFiltros({})}
            className="inline-flex h-10 items-center gap-1 rounded-xl px-2.5 text-[12.5px] text-text-tertiary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60"
          >
            <X size={13} aria-hidden /> Limpar
          </button>
        )}
        <span className="text-[12px] text-text-tertiary" aria-live="polite">
          {filtrando ? `${totalVisivel} ${totalVisivel === 1 ? "negócio" : "negócios"}` : ""}
        </span>

        <div role="radiogroup" aria-label="Visualização" className="ml-auto inline-flex shrink-0 rounded-xl bg-surface-2 p-1 ring-1 ring-border-subtle">
          {(
            [
              ["kanban", "Kanban", Columns3],
              ["lista", "Lista", Rows3],
            ] as const
          ).map(([v, rotulo, Icone]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={visao === v}
              onClick={() => trocarVisao(v)}
              className={cn(
                "inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-500/60",
                visao === v ? "bg-surface-3 text-text-primary" : "text-text-tertiary hover:text-text-primary"
              )}
            >
              <Icone size={14} aria-hidden /> {rotulo}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-2xl bg-danger/10 px-4 py-3 text-[13px] text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Fechar aviso" className="shrink-0 rounded p-0.5 hover:bg-danger/15">
            <X size={14} aria-hidden />
          </button>
        </div>
      )}

      {isLoading && stages.length === 0 ? (
        <div className="flex gap-3 overflow-hidden" aria-busy="true" aria-label="Carregando negócios">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[420px] w-[292px] shrink-0 animate-pulse rounded-2xl bg-surface-1/70 ring-1 ring-border-subtle" />
          ))}
        </div>
      ) : stages.length === 0 ? (
        <EmptyState
          icon={<Handshake size={36} className="text-text-tertiary" />}
          title="Nenhum funil configurado"
          description="Um funil padrão é criado sozinho na primeira vez que você abre esta tela."
        />
      ) : visao === "lista" ? (
        <ListView etapas={visiveis} agora={agora} onAbrir={(d) => setOpenDealId(d.id)} />
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="flex min-h-[460px] snap-x gap-3 overflow-x-auto pb-4 [max-height:calc(100dvh-330px)]">
            {visiveis.map((stage) => (
              <StageColumn
                key={stage.id}
                etapa={stage}
                defs={defs}
                agora={agora}
                maiorTotalAberto={maiorTotalAberto}
                arrastandoAlgo={!!dragging}
                onAbrir={(d) => setOpenDealId(d.id)}
                onNovo={(id) => setNovoNaEtapa(id)}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2, 0, 0, 1)" }}>
            {dragging && <DealCard deal={dragging.deal} tipoDaEtapa={dragging.tipo} defs={defs} agora={agora} arrastando />}
          </DragOverlay>
        </DndContext>
      )}

      {openDealId && <DealDrawer dealId={openDealId} onClose={() => setOpenDealId(null)} onChanged={refresh} />}

      {novoNaEtapa !== null && (
        <NewDealModal
          pipelines={pipelines}
          pipelineId={pipelineId}
          etapaInicial={novoNaEtapa}
          onClose={() => setNovoNaEtapa(null)}
          onCreated={() => {
            setNovoNaEtapa(null);
            refresh();
          }}
        />
      )}
    </div>
  );
}

function NewDealModal({
  pipelines,
  pipelineId,
  etapaInicial,
  onClose,
  onCreated,
}: {
  pipelines: PipelineOption[];
  pipelineId: string;
  /** Vazio = primeira etapa; o "+" da coluna já manda a etapa dela. */
  etapaInicial: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = React.useState({ name: "", amount: "", stageId: etapaInicial, description: "" });
  const [contactQuery, setContactQuery] = React.useState("");
  const [contacts, setContacts] = React.useState<{ id: string; name: string; email: string }[]>([]);
  const [contactId, setContactId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [campos, setCampos] = React.useState<DefinicaoDeCampo[]>([]);
  const [rascunho, setRascunho] = React.useState<Rascunho>({});

  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];

  React.useEffect(() => {
    if (!pipeline?.id) return;
    fetch(`/api/custom-fields?entity=deal&pipelineId=${pipeline.id}`)
      .then((r) => r.json())
      .then((d) => setCampos(d.fields ?? []))
      .catch(() => setCampos([]));
  }, [pipeline?.id]);

  React.useEffect(() => {
    if (contactQuery.trim().length < 2) {
      setContacts([]);
      return;
    }
    const timer = setTimeout(() => {
      fetch(`/api/contacts?q=${encodeURIComponent(contactQuery)}`)
        .then((r) => r.json())
        .then((d) => setContacts(d.contacts ?? []))
        .catch(() => setContacts([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [contactQuery]);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        pipelineId: pipeline?.id,
        stageId: form.stageId || undefined,
        amount: Number(form.amount.replace(/\./g, "").replace(",", ".")) || 0,
        description: form.description,
        contactId: contactId || undefined,
        customFields: rascunhoParaEnvio(campos, rascunho),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Não foi possível criar o negócio.");
      return;
    }
    onCreated();
  }

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent title="Novo negócio">
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="deal-name">Nome</Label>
            <Input
              id="deal-name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Implantação para Acme"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="deal-amount">Valor</Label>
              <Input
                id="deal-amount"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                placeholder="1500,00"
              />
            </div>
            <div>
              <Label htmlFor="deal-stage">Etapa</Label>
              <Select
                id="deal-stage"
                value={form.stageId}
                onChange={(e) => setForm({ ...form, stageId: e.target.value })}
              >
                <option value="">Primeira etapa</option>
                {(pipeline?.stages ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
            </div>
          </div>

          <div>
            <Label htmlFor="deal-contact">Contato</Label>
            <Input
              id="deal-contact"
              value={contactQuery}
              onChange={(e) => { setContactQuery(e.target.value); setContactId(""); }}
              placeholder="Buscar por nome, e-mail ou telefone"
            />
            {contacts.length > 0 && !contactId && (
              <div className="mt-1.5 flex max-h-[140px] flex-col overflow-y-auto rounded-xl bg-surface-2 p-1">
                {contacts.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setContactId(c.id); setContactQuery(c.name || c.email); setContacts([]); }}
                    className="rounded-lg px-2.5 py-1.5 text-left text-[13px] text-text-secondary hover:bg-surface-3 hover:text-text-primary"
                  >
                    {c.name || "Sem nome"} <span className="text-text-tertiary">{c.email}</span>
                  </button>
                ))}
              </div>
            )}
            {contactId && (
              <p className="mt-1.5 inline-flex items-center gap-1.5 text-[12px] text-emerald-400">
                Contato vinculado
                <button type="button" onClick={() => { setContactId(""); setContactQuery(""); }}>
                  <X size={12} />
                </button>
              </p>
            )}
          </div>

          <CamposDoFormulario
            defs={campos}
            rascunho={rascunho}
            prefixo="novo"
            colunas={2}
            onChange={(k, v) => setRascunho((r) => ({ ...r, [k]: v }))}
          />

          <div>
            <Label htmlFor="deal-desc">Observações</Label>
            <Textarea
              id="deal-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          {error && <p className="text-[13px] text-danger">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={busy || !form.name.trim()}>
              {busy && <Loader2 size={15} className="animate-spin" />} Criar
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
