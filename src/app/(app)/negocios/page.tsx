"use client";

import * as React from "react";
import Link from "next/link";
import { Handshake, Plus, Loader2, X, SlidersHorizontal, Search, Columns3, Rows3 } from "lucide-react";
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
import { reaisDigitados } from "@/lib/dinheiro";
import { CamposDoFormulario, rascunhoParaEnvio, type Rascunho } from "@/components/crm/campos-personalizados";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { DealCard } from "@/components/crm/negocios/deal-card";
import { StageColumn } from "@/components/crm/negocios/stage-column";
import { ListView } from "@/components/crm/negocios/list-view";
import { ResumoDoFunilView, type EtapaDeConversao } from "@/components/crm/negocios/resumo";
import { LegendaDoQuadro } from "@/components/crm/negocios/legenda";
import { ZonasDeFechamento, ZONA_GANHO, ZONA_PERDIDO } from "@/components/crm/negocios/zonas-de-fechamento";
import { usePreferencia } from "@/components/crm/negocios/use-preferencia";
import {
  comparativoDeGanho,
  filtrarEtapas,
  precisaAtencao,
  resumoDoFunil,
  serieDeGanhoDoMes,
  type EtapaKanban,
  type FiltrosDeNegocio,
  type NegocioKanban,
  type VisaoSalva,
} from "@/components/crm/negocios/modelo";

interface PipelineOption {
  id: string;
  name: string;
  stages: { id: string; name: string; type: string }[];
}

const VISOES: { id: VisaoSalva; rotulo: string }[] = [
  { id: "todos", rotulo: "Todos" },
  { id: "meus", rotulo: "Meus" },
  { id: "atencao", rotulo: "Precisam de atenção" },
  { id: "fechando", rotulo: "Fechando este mês" },
];

const digitando = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));

export default function NegociosPage() {
  const [pipelines, setPipelines] = React.useState<PipelineOption[]>([]);
  const [pipelineId, setPipelineId] = React.useState("");
  const [stages, setStages] = React.useState<EtapaKanban[]>([]);
  const [defs, setDefs] = React.useState<DefinicaoDeCampo[]>([]);
  const [conversao, setConversao] = React.useState<EtapaDeConversao[]>([]);
  const [meuId, setMeuId] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [novoNaEtapa, setNovoNaEtapa] = React.useState<string | null>(null);
  const [openDealId, setOpenDealId] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState<{ deal: NegocioKanban; tipo: string } | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [filtros, setFiltros] = React.useState<FiltrosDeNegocio>({ visao: "todos" });
  const [visao, setVisao] = usePreferencia("eva:negocios:visao", "kanban", ["kanban", "lista"] as const);
  const [resumoAberto, setResumoAberto] = usePreferencia("eva:negocios:resumo", "aberto", ["aberto", "recolhido"] as const);
  // Relógio da tela: muda só quando os dados chegam (dias parados, atrasos).
  const [agora, setAgora] = React.useState(() => new Date());
  const buscaRef = React.useRef<HTMLInputElement>(null);

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
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setMeuId(d.session?.userId ?? ""))
      .catch(() => setMeuId(""));
  }, []);

  // Atalhos: "/" busca, "n" cria. Nunca enquanto a pessoa digita.
  React.useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || digitando(e.target)) return;
      if (e.key === "/") {
        e.preventDefault();
        buscaRef.current?.focus();
      } else if (e.key === "n" || e.key === "N") {
        e.preventDefault();
        setNovoNaEtapa("");
      }
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, []);

  const refresh = React.useCallback(async () => {
    setIsLoading(true);
    try {
      const q = pipelineId ? `?pipeline=${pipelineId}` : "";
      const [res, funil] = await Promise.all([
        fetch(`/api/deals${q}`),
        fetch(`/api/deals/funil${q}`).catch(() => null),
      ]);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Não foi possível carregar os negócios.");
      setStages(data.stages ?? []);
      setDefs(data.fields ?? []);
      setConversao(funil?.ok ? ((await funil.json()).conversao ?? []) : []);
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

  const filtrosEfetivos = React.useMemo(() => ({ ...filtros, meuId }), [filtros, meuId]);
  const visiveis = React.useMemo(() => filtrarEtapas(stages, filtrosEfetivos, agora), [stages, filtrosEfetivos, agora]);
  const dadosDoResumo = React.useMemo(() => {
    const r = resumoDoFunil(stages, agora);
    const c = comparativoDeGanho(stages, agora);
    return {
      abertoCents: r.abertoCents,
      abertos: r.abertos,
      ponderadoCents: r.ponderadoCents,
      ganhoMesCents: c.esteMesCents,
      ganhosNoMes: r.ganhosNoMes,
      variacaoGanho: c.variacao,
      serieGanho: serieDeGanhoDoMes(stages, agora),
      atencao: precisaAtencao(stages, agora),
    };
  }, [stages, agora]);
  const donos = React.useMemo(() => {
    const m = new Map<string, string>();
    for (const s of stages) for (const d of s.deals) if (d.owner) m.set(d.owner.id, d.owner.name || "Sem nome");
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [stages]);
  const maiorTotalAberto = Math.max(0, ...visiveis.filter((s) => s.type === "open").map((s) => s.totalCents));
  const filtrando = !!(filtros.busca?.trim() || filtros.dono || (filtros.visao && filtros.visao !== "todos"));
  const totalVisivel = visiveis.reduce((s, e) => s + e.deals.length, 0);
  const etapaGanha = stages.find((s) => s.type === "won");
  const etapaPerdida = stages.find((s) => s.type === "lost");

  function handleDragStart(event: DragStartEvent) {
    for (const s of stages) {
      const deal = s.deals.find((d) => d.id === event.active.id);
      if (deal) return setDragging({ deal, tipo: s.type });
    }
  }

  async function handleDragEnd(event: DragEndEvent) {
    setDragging(null);
    const dealId = String(event.active.id);
    const alvo = event.over ? String(event.over.id) : "";
    const stageId = alvo === ZONA_GANHO ? etapaGanha?.id : alvo === ZONA_PERDIDO ? etapaPerdida?.id : alvo;
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

  const contagemDaVisao = (v: VisaoSalva) =>
    v === "todos" ? null : filtrarEtapas(stages, { visao: v, meuId }, agora).reduce((s, e) => s + e.deals.length, 0);

  return (
    <div className="flex min-h-0 flex-col gap-5">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="font-display text-[22px] font-semibold tracking-[-0.01em] text-text-primary">Negócios</h1>
          {pipelines.length > 1 && (
            <div className="w-[180px]">
              <label htmlFor="pipeline" className="sr-only">
                Funil
              </label>
              <Select id="pipeline" value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} className="h-9 text-[13px]">
                {pipelines.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/negocios/configurar"
            aria-label="Personalizar funis e campos"
            title="Personalizar funis e campos"
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border-subtle bg-surface-1 px-3 text-[12.5px] font-medium text-text-secondary outline-none transition-colors hover:border-border-default hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60"
          >
            <SlidersHorizontal size={14} aria-hidden /> <span className="hidden sm:inline">Personalizar</span>
          </Link>
          <Button onClick={() => setNovoNaEtapa("")} className="h-9 rounded-lg px-3.5 text-[13px]" title="Novo negócio (N)">
            <Plus size={15} aria-hidden /> Novo negócio
          </Button>
        </div>
      </header>

      <ResumoDoFunilView
        dados={dadosDoResumo}
        conversao={conversao}
        recolhido={resumoAberto === "recolhido"}
        onAlternar={() => setResumoAberto(resumoAberto === "recolhido" ? "aberto" : "recolhido")}
        verAtencao={filtros.visao === "atencao"}
        onVerAtencao={() => setFiltros((f) => ({ ...f, visao: f.visao === "atencao" ? "todos" : "atencao" }))}
      />

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border-subtle pb-2.5">
        <nav aria-label="Visões" className="-mb-[11px] flex flex-wrap gap-0.5">
          {VISOES.map((v) => {
            const ativa = (filtros.visao ?? "todos") === v.id;
            const n = contagemDaVisao(v.id);
            return (
              <button
                key={v.id}
                type="button"
                aria-pressed={ativa}
                onClick={() => setFiltros((f) => ({ ...f, visao: v.id }))}
                className={cn(
                  "relative inline-flex h-9 items-center gap-1.5 rounded-t-md px-2.5 text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-500/60",
                  ativa ? "text-text-primary" : "text-text-tertiary hover:text-text-primary"
                )}
              >
                {v.rotulo}
                {n !== null && n > 0 && (
                  <span className={cn("tabular-nums text-[11.5px]", v.id === "atencao" ? "text-amber-300" : "text-text-tertiary")}>{n}</span>
                )}
                {ativa && <span aria-hidden className="absolute inset-x-2 bottom-0 h-[2px] rounded-full bg-accent-500" />}
              </button>
            );
          })}
        </nav>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative w-[260px] max-w-full">
            <Search size={14} aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-tertiary" />
            <label htmlFor="busca-negocio" className="sr-only">
              Buscar negócio
            </label>
            <Input
              ref={buscaRef}
              id="busca-negocio"
              value={filtros.busca ?? ""}
              onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
              placeholder="Buscar negócio, empresa ou contato"
              className="h-9 rounded-lg pl-8 pr-8 text-[13px]"
            />
            <kbd className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded border border-border-default px-1.5 font-sans text-[11px] text-text-tertiary">
              /
            </kbd>
          </div>
          <div className="w-[170px]">
            <label htmlFor="filtro-dono" className="sr-only">
              Responsável
            </label>
            <Select
              id="filtro-dono"
              value={filtros.dono ?? ""}
              onChange={(e) => setFiltros((f) => ({ ...f, dono: e.target.value || undefined }))}
              className="h-9 rounded-lg text-[13px]"
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
          <div role="radiogroup" aria-label="Visualização" className="inline-flex shrink-0 rounded-lg border border-border-subtle bg-surface-1 p-0.5">
            {(
              [
                ["kanban", "Quadro", Columns3],
                ["lista", "Lista", Rows3],
              ] as const
            ).map(([v, rotulo, Icone]) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={visao === v}
                onClick={() => setVisao(v)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-accent-500/60",
                  visao === v ? "bg-surface-3 text-text-primary" : "text-text-tertiary hover:text-text-primary"
                )}
              >
                <Icone size={13} aria-hidden /> {rotulo}
              </button>
            ))}
          </div>
          <LegendaDoQuadro />
        </div>
      </div>

      {filtrando && (
        <div className="-mt-2 flex items-center gap-2 text-[12px] text-text-tertiary" aria-live="polite">
          <span>
            {totalVisivel} {totalVisivel === 1 ? "negócio" : "negócios"}
          </span>
          <button
            type="button"
            onClick={() => setFiltros({ visao: "todos" })}
            className="inline-flex items-center gap-1 rounded px-1 text-text-secondary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60"
          >
            <X size={12} aria-hidden /> Limpar filtros
          </button>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl bg-danger/10 px-4 py-3 text-[13px] text-danger">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Fechar aviso" className="shrink-0 rounded p-0.5 hover:bg-danger/15">
            <X size={14} aria-hidden />
          </button>
        </div>
      )}

      {isLoading && stages.length === 0 ? (
        <div className="flex gap-2.5 overflow-hidden" aria-busy="true" aria-label="Carregando negócios">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[420px] w-[288px] shrink-0 animate-pulse rounded-xl border border-border-subtle bg-surface-1" />
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
          <div className="relative">
            <div className="flex min-h-[440px] snap-x gap-2.5 overflow-x-auto pb-4 [max-height:calc(100dvh-300px)]">
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
            <ZonasDeFechamento
              visivel={!!dragging && dragging.tipo === "open"}
              temGanho={!!etapaGanha}
              temPerdido={!!etapaPerdida}
            />
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
    const amount = reaisDigitados(form.amount);
    if (amount === null) {
      setError("Valor inválido (máximo R$ 21 milhões).");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        pipelineId: pipeline?.id,
        stageId: form.stageId || undefined,
        amount,
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
