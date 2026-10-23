"use client";

import * as React from "react";
import { Clock, StickyNote, MessageSquare, Repeat, Plus, ChevronRight } from "lucide-react";
import { LogoOficial, marcaDoCanal } from "@/components/ui/logo-oficial";
import Link from "@/components/contrato/link";
import { Input, Textarea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { focusRing } from "@/components/ui/styles";
import { DealDrawer } from "@/components/crm/deal-drawer";
import { useConcluirTarefa } from "@/components/tarefas/concluir";
import { cn, formatRelativeDate } from "@/lib/utils";

interface DealRow {
  id: string; name: string; amountCents: number;
  stage: string; stageType: string; pipeline: string; closedAt: string | null;
}
interface TaskRow { id: string; type: string; text: string; dueAt: string | null; doneAt: string | null }
interface NoteRow { id: string; text: string; createdAt: string }
interface ConversationRow { id: string; channel: string; status: string; updatedAt: string }
interface EnrollmentRow {
  id: string; sequenceName: string; currentStep: number;
  status: string; stoppedReason: string | null; nextRunAt: string;
}

interface Activity {
  deals: DealRow[];
  tasks: TaskRow[];
  notes: NoteRow[];
  conversations: ConversationRow[];
  enrollments: EnrollmentRow[];
}

export type SecaoDaAtividade = "tarefas" | "negocios" | "sequencias" | "conversas" | "notas";
const TODAS: SecaoDaAtividade[] = ["negocios", "tarefas", "sequencias", "conversas", "notas"];

const VAZIO: Activity = { deals: [], tasks: [], notes: [], conversations: [], enrollments: [] };

function money(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp_meta: "WhatsApp", whatsapp_qr: "WhatsApp", instagram: "Instagram",
  messenger: "Messenger", telegram: "Telegram", tiktok: "TikTok", webchat: "Webchat",
};

// Bloco de linha da v5: cápsula baixa em superfície elevada, borda de meio tom.
const bloco = "rounded-[14px] bg-raised px-3.5 ring-1 ring-border-subtle";

/**
 * Tudo que aconteceu com o contato: negócios, tarefas, notas, conversas e
 * réguas.
 *
 * A rota `/api/contacts/[id]` já devolvia isso tudo desde o começo; era a tela
 * que jogava fora e mostrava só nome, e-mail e telefone. Ficha de contato sem
 * histórico obriga a pessoa a abrir quatro telas para responder "e aí, como
 * está esse cliente?".
 *
 * `secoes` escolhe o que aparece (o Resumo da ficha mostra tarefas e negócios;
 * a aba Atividade, o resto). `pedidoDeTarefa` muda quando o botão redondo
 * "Tarefa" da ficha é tocado: abre o campo de nova tarefa já com foco.
 */
export function ContactActivity({
  contactId, onCountsChange, secoes = TODAS, pedidoDeTarefa = 0,
}: {
  contactId: string;
  onCountsChange?: (abertos: number) => void;
  secoes?: SecaoDaAtividade[];
  pedidoDeTarefa?: number;
}) {
  const [data, setData] = React.useState<Activity>(VAZIO);
  const [carregando, setCarregando] = React.useState(true);
  const [novaTarefa, setNovaTarefa] = React.useState("");
  const [escrevendoTarefa, setEscrevendoTarefa] = React.useState(false);
  const [novaNota, setNovaNota] = React.useState("");
  const [dealAberto, setDealAberto] = React.useState<string | null>(null);
  // Pedido novo do botão "Tarefa": abre o campo (ajuste no render, sem efeito).
  const [pedidoAtendido, setPedidoAtendido] = React.useState(pedidoDeTarefa);
  if (pedidoDeTarefa !== pedidoAtendido) {
    setPedidoAtendido(pedidoDeTarefa);
    setEscrevendoTarefa(true);
  }
  const mostra = (s: SecaoDaAtividade) => secoes.includes(s);
  // Outro contato: volta ao "carregando" (ajuste no render, sem efeito).
  const [contatoCarregado, setContatoCarregado] = React.useState(contactId);
  if (contatoCarregado !== contactId) {
    setContatoCarregado(contactId);
    setCarregando(true);
  }
  // "Agora" da última carga: o "atrasada" não muda sozinho a cada render.
  const [agora, setAgora] = React.useState(0);

  const carregar = React.useCallback(async () => {
    const res = await fetch(`/api/contacts/${contactId}`);
    if (!res.ok) { setCarregando(false); return; }
    const d = await res.json();
    setData({
      deals: d.deals ?? [], tasks: d.tasks ?? [], notes: d.notes ?? [],
      conversations: d.conversations ?? [], enrollments: d.enrollments ?? [],
    });
    setAgora(Date.now());
    setCarregando(false);
  }, [contactId]);

  React.useEffect(() => {
    void (async () => {
      await carregar();
    })();
  }, [carregar]);

  React.useEffect(() => {
    onCountsChange?.(data.tasks.filter((t) => !t.doneAt).length);
  }, [data.tasks, onCountsChange]);

  async function criarTarefa() {
    if (!novaTarefa.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: novaTarefa.trim(), contactId, due: "+2 dias" }),
    });
    setNovaTarefa("");
    setEscrevendoTarefa(false);
    carregar();
  }

  async function criarNota() {
    if (!novaNota.trim()) return;
    await fetch("/api/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: novaNota.trim(), contactId }),
    });
    setNovaNota("");
    carregar();
  }

  // Concluir abre o diálogo (resultado + próximo passo obrigatório);
  // desmarcar reabre direto.
  const { abrir: abrirConclusao, dialogo: dialogoDeConclusao } = useConcluirTarefa(() => carregar());

  async function alternarTarefa(t: TaskRow, feita: boolean) {
    if (!feita) {
      abrirConclusao(t);
      return;
    }
    await fetch(`/api/tasks/${t.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: false }),
    });
    carregar();
  }

  async function criarNegocio() {
    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Novo negócio", contactId }),
    });
    const d = await res.json().catch(() => ({}));
    await carregar();
    if (d.deal?.id) setDealAberto(d.deal.id);
  }

  if (carregando) {
    return <p className="py-6 text-center text-small text-text-tertiary">Carregando histórico...</p>;
  }

  const vazio = secoes.every((s) =>
    s === "negocios" ? data.deals.length === 0
      : s === "tarefas" ? data.tasks.length === 0
      : s === "notas" ? data.notes.length === 0
      : s === "conversas" ? data.conversations.length === 0
      : data.enrollments.length === 0
  );
  const emAberto = data.deals.filter((d) => d.stageType === "open").reduce((s, d) => s + d.amountCents, 0);

  return (
    <div className="flex flex-col gap-5">
      {vazio && secoes.length === TODAS.length && (
        <p className={cn(bloco, "py-3 text-small text-text-tertiary")}>
          Nada registrado ainda. Crie um negócio, uma tarefa ou escreva a primeira nota.
        </p>
      )}

      {mostra("tarefas") && (
        <section className="flex flex-col gap-2">
          <TituloDaSecao titulo="Tarefas" />
          {data.tasks.length === 0 && !escrevendoTarefa && <p className="text-small text-text-tertiary">Nenhuma tarefa com este contato.</p>}
          {data.tasks.map((t) => {
            const atrasada = !t.doneAt && !!t.dueAt && new Date(t.dueAt).getTime() < agora;
            return (
              <label key={t.id} className={cn(bloco, "flex min-h-12 cursor-pointer items-center gap-2.5 py-2 hover:bg-hover")}>
                <Checkbox checked={!!t.doneAt} onCheckedChange={() => alternarTarefa(t, !!t.doneAt)} />
                <span className={cn("min-w-0 flex-1 truncate text-small", t.doneAt ? "text-text-tertiary line-through" : "text-text-primary")}>
                  {t.text}
                </span>
                {t.dueAt && !t.doneAt && (
                  <span className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full bg-hover px-2 py-0.5 font-mono text-caption",
                    atrasada ? "text-danger" : "text-text-secondary"
                  )}>
                    <Clock size={10} aria-hidden /> {formatRelativeDate(t.dueAt)}
                  </span>
                )}
              </label>
            );
          })}
          {escrevendoTarefa ? (
            <div className="flex gap-2">
              <Input
                autoFocus
                aria-label="Nova tarefa"
                value={novaTarefa}
                onChange={(e) => setNovaTarefa(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") criarTarefa();
                  if (e.key === "Escape") { setNovaTarefa(""); setEscrevendoTarefa(false); }
                }}
                placeholder="Nova tarefa, vence em 2 dias"
              />
              <Button variant="secondary" size="icon" aria-label="Criar tarefa" onClick={criarTarefa} disabled={!novaTarefa.trim()}>
                <Plus aria-hidden />
              </Button>
            </div>
          ) : (
            <BotaoAdicionar onClick={() => setEscrevendoTarefa(true)}>Adicionar tarefa</BotaoAdicionar>
          )}
        </section>
      )}

      {mostra("negocios") && (
        <section className="flex flex-col gap-2">
          <TituloDaSecao
            titulo={emAberto > 0 ? `Negócios · ${money(emAberto)} em aberto` : "Negócios"}
            acao={<button type="button" onClick={criarNegocio} className={cn("inline-flex items-center gap-1 rounded-full px-1.5 text-caption font-medium text-accent-fg hover:underline", focusRing)}><Plus size={12} aria-hidden /> Adicionar</button>}
          />
          {data.deals.length === 0 ? (
            <p className="text-small text-text-tertiary">Nenhum negócio com este contato.</p>
          ) : (
            data.deals.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDealAberto(d.id)}
                className={cn(bloco, "group flex min-h-12 items-center gap-3 py-2 text-left transition-colors duration-120 hover:bg-hover", focusRing)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-small text-text-primary">{d.name}</span>
                  <span className="block truncate text-caption text-text-tertiary">{d.pipeline} · {d.stage}</span>
                </span>
                {d.stageType === "won" && <Badge variant="success">Ganho</Badge>}
                {d.stageType === "lost" && <Badge variant="danger">Perdido</Badge>}
                {d.amountCents > 0 && <span className="shrink-0 text-small tabular-nums text-text-secondary">{money(d.amountCents)}</span>}
                <ChevronRight size={14} aria-hidden className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
              </button>
            ))
          )}
        </section>
      )}

      {mostra("sequencias") && data.enrollments.length > 0 && (
        <section className="flex flex-col gap-2">
          <TituloDaSecao titulo="Sequências" />
          {data.enrollments.map((e) => (
            <div key={e.id} className={cn(bloco, "flex min-h-12 items-center gap-3 py-2")}>
              <Repeat size={14} aria-hidden className="shrink-0 text-text-tertiary" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-small text-text-primary">{e.sequenceName}</span>
                <span className="block text-caption text-text-tertiary">
                  Passo {e.currentStep + 1}
                  {e.status === "active"
                    ? ` · próximo ${formatRelativeDate(e.nextRunAt)}`
                    : e.stoppedReason ? ` · parou: ${e.stoppedReason}` : ""}
                </span>
              </span>
              <Badge variant={e.status === "active" ? "success" : "neutral"}>
                {e.status === "active" ? "Ativa" : e.status === "done" ? "Concluída" : "Parada"}
              </Badge>
            </div>
          ))}
        </section>
      )}

      {mostra("conversas") && data.conversations.length > 0 && (
        <section className="flex flex-col gap-2">
          <TituloDaSecao titulo="Conversas" />
          {data.conversations.map((c) => (
            <Link
              key={c.id}
              href={`/conversas?c=${c.id}`}
              className={cn(bloco, "group flex min-h-11 items-center gap-2.5 py-2 transition-colors duration-120 hover:bg-hover", focusRing)}
            >
              {marcaDoCanal(c.channel) ? (
                <LogoOficial marca={marcaDoCanal(c.channel)!} tamanho={14} />
              ) : (
                <MessageSquare size={14} aria-hidden className="shrink-0 text-text-tertiary" />
              )}
              <span className="min-w-0 flex-1 truncate text-small text-text-primary">{CHANNEL_LABEL[c.channel] ?? c.channel}</span>
              <span className="shrink-0 text-caption text-text-tertiary">{formatRelativeDate(c.updatedAt)}</span>
              <ChevronRight size={14} aria-hidden className="shrink-0 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
        </section>
      )}

      {mostra("notas") && (
        <section className="flex flex-col gap-2">
          <TituloDaSecao titulo="Notas" />
          <div className="flex gap-2">
            <Textarea
              rows={2}
              aria-label="Nova nota"
              value={novaNota}
              onChange={(e) => setNovaNota(e.target.value)}
              placeholder="Registrar o que aconteceu..."
            />
            <Button variant="secondary" size="icon" aria-label="Salvar nota" onClick={criarNota} disabled={!novaNota.trim()}>
              <StickyNote aria-hidden />
            </Button>
          </div>
          {data.notes.map((n) => (
            <div key={n.id} className={cn(bloco, "py-2.5")}>
              <p className="whitespace-pre-wrap text-small text-text-secondary">{n.text}</p>
              <p className="mt-1 font-mono text-caption text-text-tertiary">{formatRelativeDate(n.createdAt)}</p>
            </div>
          ))}
        </section>
      )}

      {/* Fica depois do painel do contato no DOM, então pinta por cima dele. */}
      {dealAberto && (
        <DealDrawer
          dealId={dealAberto}
          onClose={() => setDealAberto(null)}
          onChanged={carregar}
        />
      )}
      {dialogoDeConclusao}
    </div>
  );
}

function TituloDaSecao({ titulo, acao }: { titulo: string; acao?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="text-small font-semibold text-text-primary">{titulo}</h3>
      {acao}
    </div>
  );
}

function BotaoAdicionar({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-9.5 items-center justify-center gap-1.5 rounded-xl bg-raised text-small font-medium text-text-secondary ring-1 ring-border-subtle transition-colors duration-120 hover:bg-hover hover:text-text-primary",
        focusRing
      )}
    >
      <Plus size={13} aria-hidden /> {children}
    </button>
  );
}
