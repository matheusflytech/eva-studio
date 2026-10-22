"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronRight, Copy, Eye, KeyRound, Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Notice } from "@/components/ui/notice";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { EVENTOS, OBJETOS_DOS_EVENTOS, nomeDoEvento } from "@/lib/webhooks/eventos";
import { cn } from "@/lib/utils";

interface Webhook {
  id: string;
  url: string;
  description: string;
  events: string[];
  active: boolean;
  source: string;
  disabled_reason: string | null;
  failing_since: string | null;
  last_success_at: string | null;
  created_at: string;
}

interface Entrega {
  id: string;
  eventoId: string;
  tipo: string;
  status: string;
  tentativas: number;
  proximaEm: string | null;
  ultimoStatus: number | null;
  ultimaResposta: string | null;
  latenciaMs: number | null;
  createdAt: string;
  payload: unknown;
}

const STATUS_DA_ENTREGA: Record<string, { rotulo: string; variant: "success" | "warning" | "danger" | "neutral" }> = {
  entregue: { rotulo: "Entregue", variant: "success" },
  pendente: { rotulo: "Vai tentar de novo", variant: "warning" },
  falhou: { rotulo: "Falhou", variant: "danger" },
  cancelada: { rotulo: "Cancelada", variant: "neutral" },
};

const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Copiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [ok, setOk] = React.useState(false);
  return (
    <IconButton
      aria-label={rotulo}
      tooltip
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(texto);
          setOk(true);
          setTimeout(() => setOk(false), 1500);
        } catch {
          /* sem área de transferência */
        }
      }}
    >
      {ok ? <Check size={13} className="text-success" /> : <Copy size={13} />}
    </IconButton>
  );
}

/** Seletor de eventos: "Todos" ou por objeto, com o curinga do objeto. */
function EscolherEventos({ valor, mudar }: { valor: string[]; mudar: (v: string[]) => void }) {
  const todos = valor.includes("*");
  const marcado = (tipo: string) => todos || valor.includes(tipo) || valor.includes(`${tipo.split(".")[0]}.*`);
  function alternar(tipo: string) {
    const objeto = tipo.split(".")[0];
    // Desfaz o curinga do objeto em tipos soltos antes de tirar um.
    let base = todos ? EVENTOS.map((e) => e.tipo as string) : valor.flatMap((f) => (f === `${objeto}.*` ? EVENTOS.filter((e) => e.objeto === objeto).map((e) => e.tipo as string) : [f]));
    base = base.includes(tipo) ? base.filter((t) => t !== tipo) : [...base, tipo];
    mudar(base.length === EVENTOS.length ? ["*"] : base);
  }
  const grupos = Object.entries(OBJETOS_DOS_EVENTOS).map(([objeto, nome]) => ({ objeto, nome, eventos: EVENTOS.filter((e) => e.objeto === objeto) }));
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-2 text-[12.5px] text-text-primary">
        <input type="checkbox" checked={todos} onChange={(e) => mudar(e.target.checked ? ["*"] : [])} /> Todos os eventos (inclusive os que vierem depois)
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        {grupos.map((g) => (
          <div key={g.objeto} className="rounded-xl border border-border-subtle p-2.5">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">{g.nome}</p>
            {g.eventos.map((e) => (
              <label key={e.tipo} className="flex items-center gap-2 py-0.5 text-[12.5px] text-text-secondary">
                <input type="checkbox" checked={marcado(e.tipo)} onChange={() => alternar(e.tipo)} />
                {e.nome} <code className="font-mono text-[10.5px] text-text-tertiary">{e.tipo}</code>
              </label>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function LogDeEntregas({ webhookId, versao }: { webhookId: string; versao: number }) {
  const [entregas, setEntregas] = React.useState<Entrega[] | null>(null);
  const [aberta, setAberta] = React.useState<string | null>(null);
  const [recarregar, setRecarregar] = React.useState(0);
  React.useEffect(() => {
    let vivo = true;
    void fetch(`/api/integracoes/webhooks/${webhookId}/entregas`)
      .then((r) => r.json())
      .catch(() => ({ entregas: [] }))
      .then((d) => {
        if (vivo) setEntregas(d.entregas ?? []);
      });
    return () => {
      vivo = false;
    };
  }, [webhookId, versao, recarregar]);

  async function reenviar(id: string) {
    await fetch(`/api/integracoes/webhooks/entregas/${id}/reenviar`, { method: "POST" }).catch(() => null);
    setRecarregar((n) => n + 1);
  }

  if (!entregas) return <p className="text-[12px] text-text-tertiary">Carregando entregas...</p>;
  if (entregas.length === 0) return <p className="text-[12px] text-text-tertiary">Nenhuma entrega ainda. Use &quot;Enviar teste&quot; para conferir a ligação.</p>;
  return (
    <div className="divide-y divide-border-subtle rounded-xl border border-border-subtle">
      {entregas.map((e) => {
        const s = STATUS_DA_ENTREGA[e.status] ?? { rotulo: e.status, variant: "neutral" as const };
        const aberto = aberta === e.id;
        return (
          <div key={e.id} className="text-[12px]">
            <button type="button" className="flex w-full items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-2" onClick={() => setAberta(aberto ? null : e.id)} aria-expanded={aberto}>
              {aberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              <span className="w-[88px] shrink-0 text-text-tertiary">{quando(e.createdAt)}</span>
              <span className="min-w-0 flex-1 truncate text-text-primary">{nomeDoEvento(e.tipo)}</span>
              <span className="font-mono text-text-tertiary">{e.ultimoStatus ?? "—"}</span>
              <span className="w-[60px] text-right text-text-tertiary">{e.latenciaMs !== null ? `${e.latenciaMs} ms` : ""}</span>
              <Badge variant={s.variant}>{s.rotulo}</Badge>
            </button>
            {aberto && (
              <div className="flex flex-col gap-2 bg-surface-2/50 px-3 pb-3 pt-1">
                <p className="text-text-tertiary">
                  Tentativas: {e.tentativas}
                  {e.proximaEm ? ` · próxima ${quando(e.proximaEm)}` : ""} · webhook-id <code className="font-mono">{e.eventoId}</code>
                </p>
                <p className="font-medium text-text-secondary">Enviado</p>
                <pre className="max-h-48 overflow-auto rounded-lg bg-surface-3 p-2.5 font-mono text-[11px] text-text-secondary">{JSON.stringify(e.payload, null, 2)}</pre>
                <p className="font-medium text-text-secondary">Resposta</p>
                <pre className="max-h-32 overflow-auto rounded-lg bg-surface-3 p-2.5 font-mono text-[11px] text-text-secondary">{e.ultimaResposta || "(vazia)"}</pre>
                <div>
                  <Button type="button" size="sm" variant="secondary" onClick={() => void reenviar(e.id)}>
                    <RotateCcw size={13} /> Reenviar
                  </Button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CartaoDoWebhook({ w, mudou, removido }: { w: Webhook; mudou: (w: Webhook) => void; removido: () => void }) {
  const [log, setLog] = React.useState(false);
  const [versao, setVersao] = React.useState(0);
  const [segredo, setSegredo] = React.useState<string | null>(null);
  const [editando, setEditando] = React.useState(false);
  const [eventos, setEventos] = React.useState(w.events);
  const [msg, setMsg] = React.useState<{ tom: "info" | "danger"; texto: string } | null>(null);
  const [ocupado, setOcupado] = React.useState(false);

  async function chamar(url: string, init: RequestInit) {
    setOcupado(true);
    setMsg(null);
    try {
      const res = await fetch(url, { headers: { "Content-Type": "application/json" }, ...init });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não deu certo.");
      return data;
    } catch (err) {
      setMsg({ tom: "danger", texto: err instanceof Error ? err.message : "Não deu certo." });
      return null;
    } finally {
      setOcupado(false);
    }
  }

  async function testar() {
    const r = await chamar(`/api/integracoes/webhooks/${w.id}/teste`, { method: "POST" });
    if (r) {
      setMsg(
        r.ok
          ? { tom: "info", texto: `Chegou: o endereço respondeu ${r.status} em ${r.latenciaMs} ms.` }
          : { tom: "danger", texto: `Não chegou${r.status ? ` (respondeu ${r.status})` : ""}. ${String(r.resposta ?? "").slice(0, 200)}` }
      );
      setLog(true);
      setVersao((v) => v + 1);
    }
  }

  const situacao = !w.active
    ? { rotulo: "Desligado", variant: "neutral" as const }
    : w.failing_since
      ? { rotulo: "Falhando", variant: "danger" as const }
      : { rotulo: "Ligado", variant: "success" as const };

  return (
    <div className="glass-card flex flex-col gap-3 rounded-2xl p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <code className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-text-primary" title={w.url}>{w.url}</code>
        <Badge variant={situacao.variant}>{situacao.rotulo}</Badge>
        {w.source === "api" && <Badge variant="neutral">criado pelo n8n</Badge>}
      </div>
      <p className="text-[12px] text-text-secondary">
        {w.description ? `${w.description} · ` : ""}
        {w.events.includes("*") ? "Todos os eventos" : w.events.map(nomeDoEvento).join(", ")}
        {w.last_success_at ? ` · última entrega ${quando(w.last_success_at)}` : ""}
      </p>
      {w.disabled_reason && <Notice tone="warning">Desligado sozinho: {w.disabled_reason} Corrija o endereço e ligue de novo.</Notice>}
      {msg && <Notice tone={msg.tom}>{msg.texto}</Notice>}
      {segredo && (
        <div className="flex items-center gap-2 rounded-xl border border-border-subtle bg-surface-2 px-3 py-2">
          <KeyRound size={13} className="shrink-0 text-text-tertiary" />
          <code className="min-w-0 flex-1 truncate font-mono text-[12px] text-text-primary">{segredo}</code>
          <Copiar texto={segredo} rotulo="Copiar segredo" />
        </div>
      )}
      {editando && (
        <div className="flex flex-col gap-2">
          <EscolherEventos valor={eventos} mudar={setEventos} />
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={ocupado || eventos.length === 0} onClick={async () => {
              const r = await chamar(`/api/integracoes/webhooks/${w.id}`, { method: "PATCH", body: JSON.stringify({ events: eventos }) });
              if (r) {
                mudou(r.webhook);
                setEditando(false);
              }
            }}>Salvar eventos</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => { setEventos(w.events); setEditando(false); }}>Cancelar</Button>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="secondary" disabled={ocupado || !w.active} onClick={() => void testar()}>
          <Send size={13} /> Enviar teste
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setLog((v) => !v)}>
          {log ? "Esconder entregas" : "Ver entregas"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={ocupado} onClick={async () => {
          if (segredo) return setSegredo(null);
          const r = await chamar(`/api/integracoes/webhooks/${w.id}/segredo`, { method: "POST", body: JSON.stringify({ acao: "mostrar" }) });
          if (r) setSegredo(r.secret);
        }}>
          <Eye size={13} /> {segredo ? "Esconder segredo" : "Mostrar segredo"}
        </Button>
        <Button type="button" size="sm" variant="ghost" disabled={ocupado} onClick={async () => {
          if (!confirm("Trocar o segredo? Quem confere a assinatura precisa receber o novo, senão passa a recusar os eventos.")) return;
          const r = await chamar(`/api/integracoes/webhooks/${w.id}/segredo`, { method: "POST", body: JSON.stringify({ acao: "trocar" }) });
          if (r) {
            setSegredo(r.secret);
            setMsg({ tom: "info", texto: "Segredo trocado. Atualize onde ele é conferido." });
          }
        }}>
          <RotateCcw size={13} /> Trocar segredo
        </Button>
        {!editando && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditando(true)}>Eventos</Button>
        )}
        <Button type="button" size="sm" variant="ghost" disabled={ocupado} onClick={async () => {
          const r = await chamar(`/api/integracoes/webhooks/${w.id}`, { method: "PATCH", body: JSON.stringify({ active: !w.active }) });
          if (r) mudou(r.webhook);
        }}>
          {w.active ? "Desligar" : "Ligar"}
        </Button>
        <Button type="button" size="sm" variant="ghost" className="ml-auto" disabled={ocupado} onClick={async () => {
          if (!confirm("Apagar este webhook? Os eventos param de chegar nele e o log some.")) return;
          const r = await chamar(`/api/integracoes/webhooks/${w.id}`, { method: "DELETE" });
          if (r) removido();
        }}>
          <Trash2 size={13} /> Apagar
        </Button>
      </div>
      {log && <LogDeEntregas webhookId={w.id} versao={versao} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Webhooks de saída: o CRM avisa um endereço (um fluxo do n8n, por exemplo)
// quando algo acontece. Cada entrega é assinada (Standard Webhooks), repetida
// sozinha quando falha e fica no log com o botão "Reenviar".
// ---------------------------------------------------------------------------
export function WebhooksPanel() {
  const [lista, setLista] = React.useState<Webhook[] | null>(null);
  const [disponivel, setDisponivel] = React.useState(true);
  const [novo, setNovo] = React.useState<{ url: string; description: string; events: string[] } | null>(null);
  const [criado, setCriado] = React.useState<{ url: string; secret: string } | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [ocupado, setOcupado] = React.useState(false);

  React.useEffect(() => {
    let vivo = true;
    void fetch("/api/integracoes/webhooks")
      .then((r) => r.json())
      .catch(() => ({ disponivel: false, webhooks: [] }))
      .then((d) => {
        if (!vivo) return;
        setDisponivel(d.disponivel !== false);
        setLista(d.webhooks ?? []);
      });
    return () => {
      vivo = false;
    };
  }, []);

  async function criar() {
    if (!novo) return;
    setOcupado(true);
    setErro(null);
    try {
      const res = await fetch("/api/integracoes/webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(novo) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Não deu certo.");
      setLista((l) => [...(l ?? []), data.webhook]);
      setCriado({ url: data.webhook.url, secret: data.secret });
      setNovo(null);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não deu certo.");
    } finally {
      setOcupado(false);
    }
  }

  if (!lista) return null;

  return (
    <div className="flex flex-col gap-3">
      {!disponivel && <Notice tone="warning">Os webhooks ainda não foram ativados no banco deste ambiente. Nenhum evento sai até lá.</Notice>}
      {criado && (
        <Notice tone="info">
          <span className="block">Webhook criado. Este é o segredo para conferir a assinatura (dá para ver de novo em &quot;Mostrar segredo&quot;):</span>
          <span className="mt-1.5 flex items-center gap-1.5">
            <code className="break-all font-mono text-[12px]">{criado.secret}</code>
            <Copiar texto={criado.secret} rotulo="Copiar segredo" />
          </span>
        </Notice>
      )}

      {lista.map((w) => (
        <CartaoDoWebhook
          key={w.id}
          w={w}
          mudou={(n) => setLista((l) => (l ?? []).map((x) => (x.id === n.id ? n : x)))}
          removido={() => setLista((l) => (l ?? []).filter((x) => x.id !== w.id))}
        />
      ))}

      {novo ? (
        <div className="glass-card flex flex-col gap-3 rounded-2xl p-4">
          {erro && <Notice tone="danger">{erro}</Notice>}
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <div>
              <Label htmlFor="webhook-url">URL que recebe (a &quot;Production URL&quot; do nó Webhook do n8n)</Label>
              <Input id="webhook-url" placeholder="https://seu-n8n.com/webhook/..." value={novo.url} onChange={(e) => setNovo({ ...novo, url: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="webhook-desc">Nome (opcional)</Label>
              <Input id="webhook-desc" placeholder="n8n — pós-venda" value={novo.description} onChange={(e) => setNovo({ ...novo, description: e.target.value })} />
            </div>
          </div>
          <EscolherEventos valor={novo.events} mudar={(events) => setNovo({ ...novo, events })} />
          <div className="flex gap-2">
            <Button type="button" disabled={ocupado || !novo.url.trim() || novo.events.length === 0} onClick={() => void criar()}>
              Criar webhook
            </Button>
            <Button type="button" variant="ghost" onClick={() => setNovo(null)}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <div className={cn(lista.length > 0 && "pt-1")}>
          <Button type="button" variant="secondary" disabled={!disponivel} onClick={() => { setCriado(null); setNovo({ url: "", description: "", events: ["deal.stage_changed", "deal.won"] }); }}>
            <Plus size={14} /> Novo webhook
          </Button>
        </div>
      )}
    </div>
  );
}
