"use client";

import * as React from "react";
import { Send, Clock, FlaskConical, Plus, X, CalendarClock, Ban, CircleHelp, ListFilter, Mail, MessageCircle, Check, Megaphone } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { CampoDataSP } from "@/components/whatsapp/campo-data-sp";
import { deSaoPaulo, formatarSaoPaulo, paraCampoSaoPaulo } from "@/lib/fuso-sp";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { SearchInput } from "@/components/ui/search-input";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Switch } from "@/components/ui/switch";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { SeletorDeAgente } from "@/components/biblioteca/seletor-de-agente";
import { LogoOficial, marcaDoCanal } from "@/components/ui/logo-oficial";
import { pulsar } from "@/lib/fundo/eventos";
import { cn, formatRelativeDate } from "@/lib/utils";
import { listTemplates, type MessageTemplate } from "@/lib/data/templates";

// ---------------------------------------------------------------------------
// Disparos.
//
// v5: a tela responde "o que está saindo?". Só a lista de campanhas (canal,
// nome, um número que importa e o status), com o envio em curso no topo. O
// formulário abre em "Nova campanha"; o placar completo (enviados, falhas,
// último erro, A/B) e Reagendar/Cancelar ficam ao abrir a campanha. Status e
// canal viraram filtro, dentro de "Filtros". Regras de envio (opt-out, fila,
// ritmo do e-mail, modelo aprovado) continuam todas no servidor, iguais.
// ---------------------------------------------------------------------------

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
  /** Recibos do WhatsApp (quem desligou a confirmação de leitura nunca conta como lida). */
  deliveredCount: number;
  readCount: number;
  status: string;
  lastError: string | null;
  scheduledAt: string | null;
  createdAt: string;
  variants: Variant[];
}

/** Cancelar ou mudar a hora, enquanto o disparo ainda está só agendado. */
function AcoesDoAgendado({
  agentId,
  broadcast,
  onMudou,
}: {
  agentId: string;
  broadcast: BroadcastRow;
  onMudou: () => Promise<void> | void;
}) {
  const [editando, setEditando] = React.useState(false);
  const [quando, setQuando] = React.useState(() =>
    broadcast.scheduledAt ? paraCampoSaoPaulo(new Date(broadcast.scheduledAt)) : ""
  );
  const [ocupado, setOcupado] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  async function enviar(body: Record<string, unknown>) {
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/broadcasts/${broadcast.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não deu certo.");
      setEditando(false);
      await onMudou();
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não deu certo.");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {editando ? (
        <div className="flex flex-col gap-2">
          <CampoDataSP valor={quando} onChange={setQuando} />
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="primary"
              disabled={ocupado}
              onClick={() => {
                const d = deSaoPaulo(quando);
                if (!d) return setErro("Data ou hora inválida.");
                void enviar({ scheduledAt: d.toISOString() });
              }}
            >
              Salvar nova hora
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(false)}>Voltar</Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="secondary" disabled={ocupado} onClick={() => setEditando(true)}>
            <CalendarClock size={13} aria-hidden="true" /> Reagendar
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-danger hover:text-danger"
            disabled={ocupado}
            onClick={() => {
              if (window.confirm("Cancelar este disparo agendado? Ninguém vai receber.")) void enviar({ acao: "cancelar" });
            }}
          >
            <Ban size={13} aria-hidden="true" /> Cancelar
          </Button>
        </div>
      )}
      {erro && <p className="text-caption text-danger">{erro}</p>}
    </div>
  );
}

interface Channels {
  whatsapp_qr: boolean;
  whatsapp_meta: boolean;
  telegram: boolean;
  /** Domínio de e-mail do contrato verificado. */
  email?: boolean;
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp_qr: "WhatsApp (QR)",
  whatsapp_meta: "WhatsApp (Meta)",
  telegram: "Telegram",
  email: "E-mail",
};

const AUDIENCE_LABEL: Record<string, string> = {
  manual: "Lista manual",
  tags: "Por etiqueta",
  segment: "Por segmento",
};

// Status na linha: cor só no dado. Enviando em azul, enviado em verde.
const STATUS_DA_LINHA: Record<string, { rotulo: string; variante: "info" | "success" | "neutral" }> = {
  sending: { rotulo: "Enviando", variante: "info" },
  scheduled: { rotulo: "Agendado", variante: "neutral" },
  done: { rotulo: "Enviado", variante: "success" },
  canceled: { rotulo: "Cancelado", variante: "neutral" },
};

// Filtro de status (o que antes seriam abas). "todos" não conta no contador.
const FILTROS_DE_STATUS = [
  { id: "todos", rotulo: "Todos" },
  { id: "sending", rotulo: "Enviando" },
  { id: "scheduled", rotulo: "Agendados" },
  { id: "done", rotulo: "Enviados" },
  { id: "canceled", rotulo: "Cancelados" },
] as const;

// O envio em curso sobe para o topo; depois os agendados; o resto na ordem do servidor.
const ORDEM_DO_STATUS: Record<string, number> = { sending: 0, scheduled: 1 };

function StatusDaCampanha({ status }: { status: string }) {
  const s = STATUS_DA_LINHA[status] ?? { rotulo: status, variante: "neutral" as const };
  return (
    <Badge variant={s.variante} dot={status === "sending" || status === "done"}>
      {status === "scheduled" && <Clock size={11} aria-hidden="true" />}
      {s.rotulo}
    </Badge>
  );
}

function IconeDoCanal({ canal }: { canal: string }) {
  // Canal com marca (WhatsApp, Telegram...) mostra o logo oficial; e-mail e o resto, o ícone genérico.
  const marca = marcaDoCanal(canal);
  const Icone = canal === "email" ? Mail : MessageCircle;
  return (
    <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] border border-border-subtle bg-raised">
      {marca ? <LogoOficial marca={marca} tamanho={16} /> : <Icone size={15} aria-hidden="true" className="text-text-secondary" />}
    </span>
  );
}

/** Nome da campanha na lista: a primeira linha do texto (e-mail e modelo não têm texto). */
function nomeDaCampanha(b: BroadcastRow): string {
  const linha = b.text.trim().split("\n")[0]?.trim();
  if (linha) return linha;
  const publico = `${AUDIENCE_LABEL[b.audience] ?? b.audience}${b.segmentName ? `: ${b.segmentName}` : ""}`;
  return `${CHANNEL_LABEL[b.channel] ?? b.channel} · ${publico}`;
}

function BarraDeProgresso({ feito, total }: { feito: number; total: number }) {
  const pct = total > 0 ? Math.min(100, Math.round((feito / total) * 100)) : 0;
  return (
    <span className="h-1.5 min-w-12 flex-1 overflow-hidden rounded-full bg-hover" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <span className="block h-full rounded-full bg-accent-solid transition-[width] duration-500" style={{ width: `${pct}%` }} />
    </span>
  );
}

/** O número que importa em cada status: progresso, hora marcada ou o resultado. */
function DadoDaCampanha({ b }: { b: BroadcastRow }) {
  if (b.status === "sending") {
    const feito = b.sentCount + b.failedCount;
    return (
      <span className="flex min-w-0 items-center gap-2.5">
        <BarraDeProgresso feito={feito} total={b.totalCount} />
        <span className="shrink-0 font-mono text-caption tabular-nums text-text-tertiary">
          {feito} de {b.totalCount}
        </span>
      </span>
    );
  }
  if (b.status === "scheduled" && b.scheduledAt) {
    return <span className="truncate text-small tabular-nums text-text-secondary">{formatarSaoPaulo(b.scheduledAt)}</span>;
  }
  if (b.status === "done") {
    const respostas = b.variants.reduce((s, v) => s + (v.replyCount ?? 0), 0);
    return (
      <span className="truncate text-small tabular-nums text-text-secondary">
        {b.variants.length > 0 ? `${respostas} ${respostas === 1 ? "resposta" : "respostas"}` : `${b.sentCount} enviados`}
        {b.readCount > 0 && ` · ${b.readCount} ${b.readCount === 1 ? "lida" : "lidas"}`}
        {b.failedCount > 0 && <span className="text-danger"> · {b.failedCount} falharam</span>}
      </span>
    );
  }
  return <span className="truncate text-small tabular-nums text-text-tertiary">{formatRelativeDate(b.createdAt)}</span>;
}

function Numero({ rotulo, valor, tom }: { rotulo: string; valor: number; tom?: "danger" }) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-[14px] bg-raised px-3.5 py-3">
      <span className="truncate text-caption text-text-tertiary">{rotulo}</span>
      <span className={cn("text-title font-semibold tabular-nums tracking-tight", tom === "danger" && valor > 0 ? "text-danger" : "text-text-primary")}>{valor}</span>
    </div>
  );
}

/** Placar completo da campanha aberta, com Reagendar/Cancelar quando agendada. */
function DetalheDaCampanha({ b, agentId, onMudou }: { b: BroadcastRow; agentId: string | null; onMudou: () => Promise<void> | void }) {
  const agendado = b.status === "scheduled";
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusDaCampanha status={b.status} />
        <span className="font-mono text-caption text-text-tertiary">
          {agendado && b.scheduledAt ? `para ${formatarSaoPaulo(b.scheduledAt)} · horário de São Paulo` : `criado ${formatRelativeDate(b.createdAt)}`}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {agendado ? (
          <div className="col-span-3">
            <Numero rotulo="Contatos estimados" valor={b.totalCount} />
          </div>
        ) : (
          <>
            <Numero rotulo="Enviados" valor={b.sentCount} />
            <Numero rotulo="Falharam" valor={b.failedCount} tom="danger" />
            <Numero rotulo="No total" valor={b.totalCount} />
          </>
        )}
      </div>
      {!agendado && b.channel.startsWith("whatsapp") && (
        <div className="flex flex-col gap-1.5">
          <div className="grid grid-cols-2 gap-2">
            <Numero rotulo="Entregues" valor={b.deliveredCount} />
            <Numero rotulo="Lidas" valor={b.readCount} />
          </div>
          <p className="text-caption text-text-tertiary">Quem desligou a confirmação de leitura no WhatsApp aparece só como entregue.</p>
        </div>
      )}
      {b.status === "sending" && (
        <div className="flex items-center gap-2.5">
          <BarraDeProgresso feito={b.sentCount + b.failedCount} total={b.totalCount} />
          <span className="font-mono text-caption tabular-nums text-text-tertiary">
            {b.sentCount + b.failedCount} de {b.totalCount}
          </span>
        </div>
      )}
      {b.lastError && b.failedCount > 0 && <Notice tone="danger">Último erro: {b.lastError}</Notice>}

      {agendado && agentId && (
        <section className="flex flex-col gap-2">
          <p className="font-mono text-caption text-text-tertiary">Agendamento</p>
          <AcoesDoAgendado agentId={agentId} broadcast={b} onMudou={onMudou} />
        </section>
      )}

      <section className="flex flex-col gap-2">
        <p className="font-mono text-caption text-text-tertiary">Para quem</p>
        <p className="flex flex-wrap items-center gap-x-1.5 text-small text-text-secondary">
          {marcaDoCanal(b.channel) && <LogoOficial marca={marcaDoCanal(b.channel)!} tamanho={14} />}
          <span>
            {CHANNEL_LABEL[b.channel] ?? b.channel} · {AUDIENCE_LABEL[b.audience] ?? b.audience}
            {b.segmentName ? `: ${b.segmentName}` : ""}
          </span>
        </p>
      </section>

      {b.text.trim() && (
        <section className="flex flex-col gap-2">
          <p className="font-mono text-caption text-text-tertiary">Mensagem</p>
          <p className="whitespace-pre-wrap rounded-[14px] bg-raised px-3.5 py-3 text-small text-text-primary">{b.text}</p>
        </section>
      )}

      {b.variants.length > 0 && (
        <section className="flex flex-col gap-1">
          <p className="mb-1 flex items-center gap-1.5 font-mono text-caption text-text-tertiary">
            <FlaskConical size={12} aria-hidden="true" /> Teste A/B
          </p>
          {b.variants.map((v) => (
            <div key={v.id ?? v.label} className="flex items-center gap-3 border-b border-border-subtle py-2 last:border-b-0">
              <Badge>{v.label}</Badge>
              <span className="min-w-0 flex-1 truncate text-small text-text-secondary">{v.text || "Modelo"}</span>
              <span className="shrink-0 font-mono text-caption tabular-nums text-text-tertiary">
                {v.sentCount ?? 0} enviados · {v.replyCount ?? 0} responderam
              </span>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

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

  // Só apresentação: o formulário, a campanha aberta e os filtros da lista.
  const [formAberto, setFormAberto] = React.useState(false);
  const [abertaId, setAbertaId] = React.useState<string | null>(null);
  const [filtrosAbertos, setFiltrosAbertos] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [filtroStatus, setFiltroStatus] = React.useState<string>("todos");
  const [filtroCanal, setFiltroCanal] = React.useState<string>("todos");
  const botaoNovoRef = React.useRef<HTMLButtonElement>(null);

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
  const isEmail = channel === "email";
  // Disparo de e-mail: o conteúdo é um modelo da Biblioteca (um por variante).
  const [modelosDeEmail, setModelosDeEmail] = React.useState<{ id: string; nome: string }[] | null>(null);
  React.useEffect(() => {
    if (!isEmail || modelosDeEmail) return;
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
  }, [isEmail, modelosDeEmail]);

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
      payload.text = isEmail ? "" : text;
      payload.templateId = isMeta || isEmail ? templateId : undefined;
    }

    // O campo é horário de São Paulo, não o fuso do navegador.
    if (scheduledAt) {
      const quando = deSaoPaulo(scheduledAt);
      if (!quando) {
        setError("Data ou hora inválida.");
        setIsSending(false);
        return;
      }
      payload.scheduledAt = quando.toISOString();
    }

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
          ? `Agendado para ${formatarSaoPaulo(data.scheduledAt)} (horário de São Paulo) — ${data.estimatedCount} contato(s).`
          : data.parouPorContrato
            ? `O disparo não começou: ${data.errors?.[0] ?? "verifique o domínio de e-mail do contrato."}`
            : data.faltam > 0
              ? `Começou: ${data.sentCount} e-mails enviados agora; os outros ${data.faltam} saem aos poucos (cerca de 40 por minuto). A lista abaixo acompanha.`
              : data.queuedCount > 0
                ? `${data.queuedCount} na fila do WhatsApp; a lista abaixo sobe conforme cada um sai.${data.failedCount ? ` ${data.failedCount} falharam.` : ""}`
                : `Disparo concluído: ${data.sentCount} enviados, ${data.failedCount} falharam.`
      );
      setRecipients("");
      setText("");
      setScheduledAt("");
      // Saiu (ou agendou): fecha o formulário e o fundo pulsa do "Nova campanha".
      setFormAberto(false);
      pulsar(botaoNovoRef.current, 1.2);
      await refresh(agentId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setIsSending(false);
    }
  }

  // ── Lista: ordem (envio em curso no topo), busca e filtros, tudo no navegador ──
  const visiveis = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return broadcasts
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => filtroStatus === "todos" || b.status === filtroStatus)
      .filter(({ b }) => filtroCanal === "todos" || b.channel === filtroCanal)
      .filter(({ b }) => !q || `${b.text} ${b.segmentName ?? ""}`.toLowerCase().includes(q))
      .sort((x, y) => (ORDEM_DO_STATUS[x.b.status] ?? 2) - (ORDEM_DO_STATUS[y.b.status] ?? 2) || x.i - y.i)
      .map(({ b }) => b);
  }, [broadcasts, busca, filtroStatus, filtroCanal]);
  const nFiltros = (filtroStatus !== "todos" ? 1 : 0) + (filtroCanal !== "todos" ? 1 : 0);
  const canaisNaLista = [...new Set(broadcasts.map((b) => b.channel))];
  // A campanha aberta vem da lista viva (o placar acompanha o polling).
  const aberta = abertaId ? broadcasts.find((b) => b.id === abertaId) ?? null : null;
  const agente = agents.find((a) => a.id === agentId);

  if (!isLoaded) return <div className="flex-1" />;

  if (agents.length === 0) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">Disparos</h1>
        <p className="text-body text-text-secondary">Crie um agente no Eva Studio primeiro pra poder mandar uma campanha.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pb-6 pt-1 lg:px-6">
      {/* Barra: título, contagem, agente e, à direita, a ajuda e a ação principal. */}
      <div className="flex min-h-10 flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-heading font-semibold tracking-tight text-text-primary">Disparos</h1>
        {channels && (
          <span className="font-mono text-caption tabular-nums text-text-tertiary">
            {broadcasts.length} {broadcasts.length === 1 ? "campanha" : "campanhas"}
          </span>
        )}
        <span aria-hidden="true" className="h-5 w-px bg-border-subtle" />
        <SeletorDeAgente agentes={agents} agentId={agentId} onChange={setAgentId} />
        <div className="ml-auto flex items-center gap-2">
          <IconButton
            aria-label="Como funcionam os disparos"
            tooltip="Uma campanha para uma lista, uma etiqueta ou um segmento, agora ou com hora marcada."
          >
            <CircleHelp />
          </IconButton>
          <Button ref={botaoNovoRef} variant="primary" onClick={() => setFormAberto(true)}>
            <Plus size={14} aria-hidden="true" />
            Nova campanha
          </Button>
        </div>
      </div>

      {/* Busca + Filtros (status e canal moram no botão). */}
      <div className="flex items-center gap-2">
        <SearchInput
          aria-label="Buscar campanha"
          placeholder="Buscar campanha"
          value={busca}
          onValueChange={setBusca}
          className="min-w-0 flex-1 sm:w-72 sm:flex-none"
        />
        <Button variant="secondary" onClick={() => setFiltrosAbertos(true)} aria-label={nFiltros ? `Filtros, ${nFiltros} ligados` : "Filtros"}>
          <ListFilter size={14} aria-hidden="true" />
          Filtros
          {nFiltros > 0 && <span className="font-mono text-caption tabular-nums text-accent-fg">{nFiltros}</span>}
        </Button>
      </div>

      {notice && (
        <Notice tone="info" onDismiss={() => setNotice(null)}>
          {notice}
        </Notice>
      )}

      {!channels ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando campanhas">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-[60px] animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none" />
          ))}
        </div>
      ) : broadcasts.length === 0 ? (
        <EmptyState
          icon={<Megaphone />}
          title="Nenhuma campanha ainda"
          description={`Mande um template aprovado para uma lista de contatos de ${agente?.name ?? "esse agente"}, na hora ou agendado.`}
          action={
            <Button variant="primary" onClick={() => setFormAberto(true)}>
              <Plus size={14} aria-hidden="true" /> Nova campanha
            </Button>
          }
        />
      ) : visiveis.length === 0 ? (
        <div className="flex flex-col items-start gap-3 py-8">
          <p className="text-body text-text-secondary">Nenhuma campanha com essa busca ou esses filtros.</p>
          <Button
            variant="secondary"
            onClick={() => {
              setBusca("");
              setFiltroStatus("todos");
              setFiltroCanal("todos");
            }}
          >
            Limpar busca e filtros
          </Button>
        </div>
      ) : (
        <ul className="flex flex-col">
          {visiveis.map((b) => (
            <li key={b.id} className="border-b border-border-subtle last:border-b-0">
              <button
                type="button"
                onClick={() => setAbertaId(b.id)}
                className={cn(
                  "grid min-h-[60px] w-full grid-cols-[34px_minmax(0,1fr)_auto] items-center gap-3 rounded-[12px] px-2 py-2 text-left transition-colors hover:bg-raised sm:grid-cols-[34px_minmax(0,1fr)_200px_110px] sm:gap-4",
                  b.status === "canceled" && "text-text-tertiary"
                )}
              >
                <IconeDoCanal canal={b.channel} />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className={cn("truncate text-body font-medium", b.status === "canceled" ? "text-text-tertiary" : "text-text-primary")}>{nomeDaCampanha(b)}</span>
                  {/* No celular o número vai embaixo do nome. */}
                  <span className="flex min-w-0 sm:hidden">
                    <DadoDaCampanha b={b} />
                  </span>
                </span>
                <span className="hidden min-w-0 sm:flex">
                  <DadoDaCampanha b={b} />
                </span>
                <span className="justify-self-end">
                  <StatusDaCampanha status={b.status} />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Filtros: status (as antigas abas) e canal. */}
      <Drawer open={filtrosAbertos} onOpenChange={setFiltrosAbertos}>
        <DrawerContent title="Filtros" description="Valem para a lista de campanhas deste agente." size="sm">
          <div className="flex flex-col gap-5">
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-mono text-caption text-text-tertiary">Status</legend>
              <div className="flex flex-wrap gap-1.5">
                {FILTROS_DE_STATUS.map((f) => (
                  <Pilula key={f.id} ativa={filtroStatus === f.id} onClick={() => setFiltroStatus(f.id)}>
                    {f.rotulo}
                  </Pilula>
                ))}
              </div>
            </fieldset>
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-mono text-caption text-text-tertiary">Canal</legend>
              <div className="flex flex-wrap gap-1.5">
                <Pilula ativa={filtroCanal === "todos"} onClick={() => setFiltroCanal("todos")}>
                  Todos
                </Pilula>
                {canaisNaLista.map((c) => (
                  <Pilula key={c} ativa={filtroCanal === c} onClick={() => setFiltroCanal(c)}>
                    {marcaDoCanal(c) && <LogoOficial marca={marcaDoCanal(c)!} tamanho={13} />}
                    {CHANNEL_LABEL[c] ?? c}
                  </Pilula>
                ))}
              </div>
            </fieldset>
            {nFiltros > 0 && (
              <div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFiltroStatus("todos");
                    setFiltroCanal("todos");
                  }}
                >
                  Limpar filtros
                </Button>
              </div>
            )}
          </div>
        </DrawerContent>
      </Drawer>

      {/* Campanha aberta: placar completo e, se agendada, Reagendar/Cancelar. */}
      <Drawer open={!!aberta} onOpenChange={(v) => !v && setAbertaId(null)}>
        {aberta && (
          <DrawerContent title={nomeDaCampanha(aberta)} description={CHANNEL_LABEL[aberta.channel] ?? aberta.channel} size="md">
            <DetalheDaCampanha b={aberta} agentId={agentId} onMudou={() => (agentId ? refresh(agentId) : undefined)} />
          </DrawerContent>
        )}
      </Drawer>

      {/* Nova campanha: o formulário de antes, inteiro, fora da frente da tela. */}
      <Drawer open={formAberto} onOpenChange={setFormAberto}>
        <DrawerContent
          title="Nova campanha"
          description="Em público por etiqueta ou segmento, só entra quem aceita receber mensagem."
          size="md"
          footer={
            <Button type="button" variant="primary" onClick={handleSend} disabled={isSending}>
              <Send size={14} aria-hidden="true" /> {isSending ? "Enviando..." : scheduledAt ? "Agendar" : "Disparar"}
            </Button>
          }
        >
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="disparo-agent">Agente</Label>
                <Select id="disparo-agent" value={agentId ?? ""} onChange={(e) => setAgentId(e.target.value)}>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </Select>
              </div>
              <div>
                <Label htmlFor="disparo-channel">Canal</Label>
                <Select id="disparo-channel" value={channel} onChange={(e) => setChannel(e.target.value)}>
                  {(["whatsapp_qr", "whatsapp_meta", "telegram", "email"] as const).map((c) => (
                    <option key={c} value={c} disabled={channels ? !channels[c] : false}>
                      {CHANNEL_LABEL[c]}
                      {channels && !channels[c] ? (c === "email" ? " — domínio não verificado" : " — não conectado") : ""}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {/* Público */}
            <div className="flex flex-col gap-1.5">
              <Label className="mb-0">Para quem</Label>
              <SegmentedControl
                label="Para quem"
                value={audience}
                onChange={setAudience}
                options={(["manual", "tags", "segment"] as const).map((a) => ({ value: a, label: AUDIENCE_LABEL[a] }))}
                className="w-fit max-w-full"
              />
            </div>

            {audience === "manual" && (
              <div>
                <Label htmlFor="disparo-recipients">{isEmail ? "E-mails (um por linha)" : "Contatos (um por linha, com DDI)"}</Label>
                <Textarea
                  id="disparo-recipients"
                  rows={4}
                  className="font-mono text-small"
                  placeholder={isEmail ? "ana@empresa.com\nbeto@empresa.com" : "5511999998888\n5511999997777"}
                  value={recipients}
                  onChange={(e) => setRecipients(e.target.value)}
                />
              </div>
            )}

            {audience === "tags" && (
              <div>
                <Label>Etiquetas</Label>
                {tags.length === 0 ? (
                  <p className="mt-1.5 text-small text-text-tertiary">Nenhuma etiqueta ainda. Crie em Contatos &gt; Etiquetas.</p>
                ) : (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {tags.map((t) => {
                      const on = selectedTags.includes(t.id);
                      return (
                        <Pilula
                          key={t.id}
                          ativa={on}
                          onClick={() => setSelectedTags(on ? selectedTags.filter((x) => x !== t.id) : [...selectedTags, t.id])}
                        >
                          {on && <Check size={12} aria-hidden="true" />}
                          {t.name}
                        </Pilula>
                      );
                    })}
                  </div>
                )}
                <p className="mt-1.5 text-caption text-text-tertiary">Quem tiver qualquer uma das etiquetas selecionadas entra na campanha.</p>
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
                  <p className="mt-1.5 text-small text-text-tertiary">Nenhum segmento ainda. Crie em Contatos &gt; Segmentos.</p>
                )}
              </div>
            )}

            {/* Mensagem */}
            <div className="flex items-center justify-between border-t border-border-subtle pt-4">
              <Label className="mb-0">Mensagem</Label>
              <label className="flex items-center gap-2 text-small text-text-secondary">
                <FlaskConical size={13} aria-hidden="true" /> Teste A/B
                <Switch checked={abEnabled} onCheckedChange={setAbEnabled} aria-label="Teste A/B" />
              </label>
            </div>

            {abEnabled ? (
              <div className="flex flex-col gap-3">
                <p className="text-caption text-text-tertiary">
                  Cada contato recebe uma das variantes, sorteada pelo peso. O placar de entrega fica separado por variante, para comparar as duas
                  com número em vez de opinião.
                </p>
                {variants.map((v, i) => (
                  <div key={i} className="flex flex-col gap-2 rounded-[14px] bg-raised px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="accent">{v.label}</Badge>
                      <Label className="mb-0 text-caption">Peso</Label>
                      <Input
                        type="number"
                        min={1}
                        className="w-20"
                        value={v.weight}
                        onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)))}
                      />
                      {isEmail && (
                        <Select
                          className="min-w-0 flex-1"
                          aria-label={`Modelo de e-mail da variante ${v.label}`}
                          value={v.templateId ?? ""}
                          onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, templateId: e.target.value || null } : x)))}
                        >
                          <option value="">Modelo de e-mail...</option>
                          {(modelosDeEmail ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                        </Select>
                      )}
                      {isMeta && (
                        <Select
                          className="min-w-0 flex-1"
                          aria-label={`Modelo aprovado da variante ${v.label}`}
                          value={v.templateId ?? ""}
                          onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, templateId: e.target.value || null } : x)))}
                        >
                          <option value="">Modelo aprovado...</option>
                          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </Select>
                      )}
                      {variants.length > 2 && (
                        <IconButton size="sm" aria-label="Remover variante" className="ml-auto hover:text-danger" onClick={() => setVariants(variants.filter((_, j) => j !== i))}>
                          <X />
                        </IconButton>
                      )}
                    </div>
                    {!isEmail && (
                      <Textarea
                        rows={2}
                        value={v.text}
                        onChange={(e) => setVariants(variants.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))}
                        placeholder={`Texto da variante ${v.label}`}
                      />
                    )}
                  </div>
                ))}
                {variants.length < 4 && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="self-start"
                    onClick={() => setVariants([...variants, { label: String.fromCharCode(65 + variants.length), text: "", templateId: null, weight: 1 }])}
                  >
                    <Plus size={13} aria-hidden="true" /> Variante
                  </Button>
                )}
              </div>
            ) : isEmail ? (
              <div>
                <Label htmlFor="disparo-email-modelo">Modelo de e-mail</Label>
                <Select id="disparo-email-modelo" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
                  <option value="">Selecione um modelo...</option>
                  {(modelosDeEmail ?? []).map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
                </Select>
                <p className="mt-1.5 text-caption text-text-tertiary">
                  Os modelos ficam na Biblioteca → Modelos de e-mail. Só recebe quem aceita mensagens e tem e-mail; quem se descadastrou fica de
                  fora. O disparo sai aos poucos (cerca de 40 por minuto) para não cair no spam.
                </p>
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
                    <p className="mt-1.5 text-caption text-text-tertiary">
                      Disparo pro canal oficial precisa ser modelo aprovado — a lista inteira está fora da janela de 24h.
                    </p>
                  </div>
                )}
                <div>
                  <Label htmlFor="disparo-text">Texto</Label>
                  <Textarea id="disparo-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Oi {nome}, tudo bem?" />
                  <p className="mt-1.5 text-caption text-text-tertiary">
                    {"{nome}"}, {"{email}"} e os campos capturados no fluxo são trocados pelos dados de cada contato.
                  </p>
                </div>
              </>
            )}

            <div className="border-t border-border-subtle pt-4">
              <Label htmlFor="disparo-quando">
                <span className="inline-flex items-center gap-1.5">
                  <Clock size={13} aria-hidden="true" /> Quando enviar
                </span>
              </Label>
              <CampoDataSP id="disparo-quando" valor={scheduledAt} onChange={setScheduledAt} />
              <p className="mt-1.5 text-caption text-text-tertiary">
                Em branco, sai agora. Agendado, dá para cancelar ou mudar a hora ao abrir a campanha até começar a enviar.
                {scheduledAt && (
                  <button type="button" onClick={() => setScheduledAt("")} className="ml-1.5 underline hover:text-text-secondary">
                    Mandar agora
                  </button>
                )}
              </p>
            </div>

            {error && <Notice tone="danger">{error}</Notice>}
          </div>
        </DrawerContent>
      </Drawer>
    </div>
  );
}

/** Opção em cápsula (filtros, etiquetas): ativa no polegar invertido. */
function Pilula({ ativa, onClick, children }: { ativa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={ativa}
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1 rounded-full px-3 text-small transition-colors",
        ativa ? "bg-inverse font-medium text-inverse-fg" : "border border-border-subtle bg-raised text-text-secondary hover:bg-hover hover:text-text-primary"
      )}
    >
      {children}
    </button>
  );
}
