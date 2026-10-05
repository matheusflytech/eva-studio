"use client";

import * as React from "react";
import Link from "next/link";
import {
  Plus, X, Check, Phone, Mail, Building2, ExternalLink, Handshake, Loader2, Clock, UserRoundX, UserRound,
} from "lucide-react";
import { DealDrawer } from "@/components/crm/deal-drawer";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, formatRelativeDate } from "@/lib/utils";
import { dinheiro, iniciais, type Conversa, type Contexto } from "./tipos";
import { useSondagem } from "./use-sondagem";

interface Funil {
  id: string;
  name: string;
  stages: { id: string; name: string; type: string }[];
}

interface Etiqueta {
  id: string;
  name: string;
  color: string;
}

async function enviar(url: string, metodo: string, corpo: unknown) {
  const res = await fetch(url, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
  return { ok: res.ok, json: await res.json().catch(() => ({})) };
}

function Secao({
  titulo, acao, children,
}: {
  titulo: string;
  acao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border-subtle px-4 py-4 last:border-0">
      <div className="mb-2.5 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

export function PainelDoCliente({
  conversa, onMudou, className,
}: {
  conversa: Conversa;
  onMudou: () => void;
  className?: string;
}) {
  const [ctx, setCtx] = React.useState<Contexto | null>(null);
  const [carregado, setCarregado] = React.useState(false);
  const [funis, setFunis] = React.useState<Funil[]>([]);
  const [etiquetas, setEtiquetas] = React.useState<Etiqueta[]>([]);
  const [nome, setNome] = React.useState("");
  const [novoNegocio, setNovoNegocio] = React.useState(false);
  const [formNegocio, setFormNegocio] = React.useState({ nome: "", valor: "", funilId: "", etapaId: "" });
  const [salvandoNegocio, setSalvandoNegocio] = React.useState(false);
  const [novaTarefa, setNovaTarefa] = React.useState("");
  const [dealAberto, setDealAberto] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const idAtual = React.useRef(conversa.id);

  const carregar = React.useCallback(async () => {
    const id = conversa.id;
    const res = await fetch(`/api/conversations/${id}/context`);
    if (!res.ok || idAtual.current !== id) return;
    const dados = (await res.json()) as Contexto;
    if (idAtual.current !== id) return;
    setCtx(dados);
    setNome((atual) => (dados.contato && atual === "" ? dados.contato.name : atual));
    setCarregado(true);
  }, [conversa.id]);

  React.useEffect(() => {
    idAtual.current = conversa.id;
    setCtx(null);
    setCarregado(false);
    setNome("");
    setNovoNegocio(false);
    setErro(null);
  }, [conversa.id]);

  useSondagem(carregar, 12000);

  // Funis e etiquetas mudam raramente: uma vez só.
  React.useEffect(() => {
    fetch("/api/pipelines").then((r) => r.json()).then((d) => setFunis(d.pipelines ?? [])).catch(() => {});
    fetch("/api/tags").then((r) => r.json()).then((d) => setEtiquetas(d.tags ?? [])).catch(() => {});
  }, []);

  const contato = ctx?.contato ?? null;

  async function salvarNome() {
    if (!contato || nome.trim() === contato.name) return;
    const r = await enviar(`/api/contacts/${contato.id}`, "PATCH", { name: nome.trim() });
    if (!r.ok) setErro(r.json.error ?? "Não foi possível salvar o nome.");
    await carregar();
    onMudou();
  }

  async function mexerEtiqueta(acao: "addTagId" | "removeTagId", id: string) {
    if (!contato) return;
    await enviar(`/api/contacts/${contato.id}`, "PATCH", { [acao]: id });
    await carregar();
  }

  async function moverEtapa(dealId: string, stageId: string) {
    const r = await enviar(`/api/deals/${dealId}`, "PATCH", { stageId });
    if (!r.ok) setErro(r.json.error ?? "Não foi possível mover o negócio.");
    await carregar();
    onMudou();
  }

  function abrirNovoNegocio() {
    const funil = funis[0];
    const etapa = funil?.stages.find((s) => s.type === "open") ?? funil?.stages[0];
    setFormNegocio({
      nome: `Negócio ${contato?.name || conversa.nome}`,
      valor: "",
      funilId: funil?.id ?? "",
      etapaId: etapa?.id ?? "",
    });
    setNovoNegocio(true);
  }

  async function criarNegocio() {
    if (!contato || !formNegocio.nome.trim()) return;
    setSalvandoNegocio(true);
    setErro(null);
    const valor = Number(formNegocio.valor.replace(/\./g, "").replace(",", ".")) || 0;
    const r = await enviar("/api/deals", "POST", {
      name: formNegocio.nome.trim(),
      contactId: contato.id,
      amount: valor,
      pipelineId: formNegocio.funilId || undefined,
      stageId: formNegocio.etapaId || undefined,
    });
    setSalvandoNegocio(false);
    if (!r.ok) return setErro(r.json.error ?? "Não foi possível criar o negócio.");
    setNovoNegocio(false);
    await carregar();
    onMudou();
  }

  async function criarTarefa() {
    if (!contato || !novaTarefa.trim()) return;
    await enviar("/api/tasks", "POST", { text: novaTarefa.trim(), contactId: contato.id, due: "+1 dia" });
    setNovaTarefa("");
    await carregar();
  }

  async function concluirTarefa(id: string) {
    await enviar(`/api/tasks/${id}`, "PATCH", { done: true });
    await carregar();
  }

  const funilEscolhido = funis.find((f) => f.id === formNegocio.funilId);
  const capturados = Object.entries(contato?.customFields ?? {}).filter(([k]) => !k.startsWith("__"));
  const etiquetasLivres = etiquetas.filter((e) => !contato?.tags.some((t) => t.id === e.id));
  const abertos = (ctx?.negocios ?? []).filter((n) => !n.closedAt);
  const fechados = (ctx?.negocios ?? []).filter((n) => n.closedAt);

  return (
    <aside className={cn("glass-card flex min-h-0 flex-col overflow-hidden rounded-3xl", className)}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!carregado ? (
          <p className="p-6 text-center text-[13px] text-text-tertiary">Carregando...</p>
        ) : !contato ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-surface-2 text-text-tertiary">
              <UserRoundX size={20} />
            </span>
            <p className="text-[13.5px] font-medium text-text-primary">Sem ficha de cliente</p>
            <p className="mt-1 max-w-[230px] text-[12px] text-text-tertiary">
              {conversa.simulado
                ? "Conversas de teste não criam ficha no CRM."
                : "A ficha é criada quando o fluxo roda. Se esta conversa é antiga, ela aparece na próxima mensagem."}
            </p>
          </div>
        ) : (
          <>
            <div className="border-b border-border-subtle px-4 py-5">
              <div className="flex items-center gap-3">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[14px] font-semibold text-text-secondary">
                  {iniciais(contato.name || conversa.nome) || <UserRound size={20} />}
                </span>
                <div className="min-w-0 flex-1">
                  <input
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    onBlur={salvarNome}
                    onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                    placeholder={conversa.nome}
                    aria-label="Nome do cliente"
                    className="w-full rounded-md bg-transparent px-1 py-0.5 text-[15px] font-semibold text-text-primary outline-none placeholder:text-text-secondary hover:bg-surface-2 focus:bg-surface-2"
                  />
                  {contato.company && (
                    <p className="flex items-center gap-1 px-1 text-[12px] text-text-tertiary">
                      <Building2 size={11} /> {contato.company.name}
                    </p>
                  )}
                </div>
              </div>

              {(contato.phone || contato.email) && (
                <div className="mt-3 flex flex-col gap-1.5 text-[12.5px] text-text-secondary">
                  {contato.phone && (
                    <span className="flex items-center gap-2"><Phone size={12} className="text-text-tertiary" /> {contato.phone}</span>
                  )}
                  {contato.email && (
                    <span className="flex items-center gap-2 break-all"><Mail size={12} className="text-text-tertiary" /> {contato.email}</span>
                  )}
                </div>
              )}

              <Link
                href={`/contatos?abrir=${contato.id}`}
                className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent-400 hover:text-accent-300"
              >
                Abrir ficha completa <ExternalLink size={11} />
              </Link>
            </div>

            {erro && <p className="border-b border-border-subtle bg-danger/8 px-4 py-2.5 text-[12px] text-danger">{erro}</p>}

            <Secao titulo="Etiquetas">
              <div className="flex flex-wrap items-center gap-1.5">
                {contato.tags.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => mexerEtiqueta("removeTagId", t.id)}
                    title="Clique para remover"
                    className="group inline-flex items-center gap-1 rounded-full bg-surface-3 px-2.5 py-1 text-[11.5px] font-medium text-text-secondary transition-colors hover:bg-danger/12 hover:text-danger"
                  >
                    {t.name}
                    <X size={10} className="opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                ))}
                {etiquetasLivres.length > 0 && (
                  <select
                    value=""
                    onChange={(e) => e.target.value && mexerEtiqueta("addTagId", e.target.value)}
                    aria-label="Adicionar etiqueta"
                    className="rounded-full bg-surface-2 px-2.5 py-1 text-[11.5px] text-text-tertiary outline-none"
                  >
                    <option value="">+ Etiqueta</option>
                    {etiquetasLivres.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                  </select>
                )}
                {contato.tags.length === 0 && etiquetasLivres.length === 0 && (
                  <span className="text-[12px] text-text-tertiary">Nenhuma etiqueta criada ainda.</span>
                )}
              </div>
            </Secao>

            <Secao
              titulo="Negócios"
              acao={
                !novoNegocio && (
                  <button
                    type="button"
                    onClick={abrirNovoNegocio}
                    className="inline-flex items-center gap-1 text-[11.5px] font-medium text-accent-400 hover:text-accent-300"
                  >
                    <Plus size={11} /> Novo
                  </button>
                )
              }
            >
              {novoNegocio && (
                <div className="mb-3 flex flex-col gap-2 rounded-2xl bg-surface-2 p-3">
                  <input
                    value={formNegocio.nome}
                    onChange={(e) => setFormNegocio({ ...formNegocio, nome: e.target.value })}
                    placeholder="Nome do negócio"
                    aria-label="Nome do negócio"
                    className="w-full rounded-lg bg-surface-3 px-2.5 py-1.5 text-[12.5px] text-text-primary outline-none placeholder:text-text-tertiary"
                  />
                  <input
                    value={formNegocio.valor}
                    onChange={(e) => setFormNegocio({ ...formNegocio, valor: e.target.value })}
                    placeholder="Valor (opcional)"
                    inputMode="decimal"
                    aria-label="Valor do negócio"
                    className="w-full rounded-lg bg-surface-3 px-2.5 py-1.5 text-[12.5px] text-text-primary outline-none placeholder:text-text-tertiary"
                  />
                  {funis.length > 1 && (
                    <select
                      value={formNegocio.funilId}
                      onChange={(e) => {
                        const f = funis.find((x) => x.id === e.target.value);
                        const et = f?.stages.find((x) => x.type === "open") ?? f?.stages[0];
                        setFormNegocio({ ...formNegocio, funilId: e.target.value, etapaId: et?.id ?? "" });
                      }}
                      aria-label="Funil"
                      className="w-full rounded-lg bg-surface-3 px-2 py-1.5 text-[12.5px] text-text-secondary outline-none"
                    >
                      {funis.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  )}
                  {funilEscolhido && (
                    <select
                      value={formNegocio.etapaId}
                      onChange={(e) => setFormNegocio({ ...formNegocio, etapaId: e.target.value })}
                      aria-label="Etapa"
                      className="w-full rounded-lg bg-surface-3 px-2 py-1.5 text-[12.5px] text-text-secondary outline-none"
                    >
                      {funilEscolhido.stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                    </select>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={criarNegocio}
                      disabled={salvandoNegocio || !formNegocio.nome.trim()}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent-500 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-accent-400 disabled:opacity-50"
                    >
                      {salvandoNegocio ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} Criar
                    </button>
                    <button
                      type="button"
                      onClick={() => setNovoNegocio(false)}
                      className="rounded-lg bg-surface-3 px-3 py-1.5 text-[12.5px] text-text-secondary hover:text-text-primary"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {abertos.length === 0 && fechados.length === 0 && !novoNegocio && (
                <p className="text-[12px] text-text-tertiary">Nenhum negócio com este cliente ainda.</p>
              )}

              <div className="flex flex-col gap-2">
                {abertos.map((n) => {
                  const funil = funis.find((f) => f.id === n.pipeline.id);
                  return (
                    <div key={n.id} className="rounded-2xl bg-surface-2 p-3">
                      <button
                        type="button"
                        onClick={() => setDealAberto(n.id)}
                        className="flex w-full items-start justify-between gap-2 text-left"
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <Handshake size={12} className="shrink-0 text-text-tertiary" />
                          <span className="truncate text-[13px] font-medium text-text-primary">{n.name}</span>
                        </span>
                        {n.amountCents > 0 && (
                          <span className="shrink-0 text-[12.5px] font-semibold text-text-primary">{dinheiro(n.amountCents)}</span>
                        )}
                      </button>
                      <div className="mt-2 flex items-center gap-2">
                        {funil ? (
                          <select
                            value={n.stage.id}
                            onChange={(e) => moverEtapa(n.id, e.target.value)}
                            aria-label={`Etapa de ${n.name}`}
                            className="min-w-0 flex-1 rounded-lg bg-surface-3 px-2 py-1 text-[12px] text-text-secondary outline-none"
                          >
                            {funil.stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                          </select>
                        ) : (
                          <span className="rounded-lg bg-surface-3 px-2 py-1 text-[12px] text-text-secondary">{n.stage.name}</span>
                        )}
                        <span className="shrink-0 text-[11px] text-text-tertiary">{n.probability}%</span>
                      </div>
                    </div>
                  );
                })}

                {fechados.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setDealAberto(n.id)}
                    className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-surface-2"
                  >
                    <span className="truncate text-[12.5px] text-text-tertiary">{n.name}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium",
                        n.stage.type === "won" ? "bg-emerald-500/12 text-emerald-300" : "bg-danger/12 text-danger"
                      )}
                    >
                      {n.stage.type === "won" ? "Ganho" : "Perdido"}
                    </span>
                  </button>
                ))}
              </div>
            </Secao>

            <Secao titulo="Tarefas">
              <div className="flex flex-col gap-1">
                {(ctx?.tarefas ?? []).map((t) => (
                  <label key={t.id} className="flex cursor-pointer items-start gap-2.5 rounded-xl px-1.5 py-1.5 hover:bg-surface-2">
                    <Checkbox checked={false} onCheckedChange={() => concluirTarefa(t.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] text-text-primary">{t.text}</span>
                      {t.dueAt && (
                        <span className={cn("mt-0.5 inline-flex items-center gap-1 text-[11px]", t.atrasada ? "text-danger" : "text-text-tertiary")}>
                          <Clock size={10} /> {formatRelativeDate(t.dueAt)}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
              <div className="mt-2 flex gap-2">
                <input
                  value={novaTarefa}
                  onChange={(e) => setNovaTarefa(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && criarTarefa()}
                  placeholder="Nova tarefa para amanhã"
                  aria-label="Nova tarefa"
                  className="min-w-0 flex-1 rounded-lg bg-surface-2 px-2.5 py-1.5 text-[12.5px] text-text-primary outline-none placeholder:text-text-tertiary"
                />
                <button
                  type="button"
                  onClick={criarTarefa}
                  disabled={!novaTarefa.trim()}
                  aria-label="Adicionar tarefa"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface-2 text-text-secondary transition-colors hover:text-text-primary disabled:opacity-40"
                >
                  <Plus size={14} />
                </button>
              </div>
            </Secao>

            {capturados.length > 0 && (
              <Secao titulo="Capturado na conversa">
                <dl className="flex flex-col gap-1.5 rounded-2xl bg-surface-2 px-3.5 py-3">
                  {capturados.map(([chave, valor]) => (
                    <div key={chave} className="flex items-start justify-between gap-3 text-[12.5px]">
                      <dt className="shrink-0 text-text-tertiary">{chave}</dt>
                      <dd className="break-words text-right text-text-primary">{String(valor)}</dd>
                    </div>
                  ))}
                </dl>
              </Secao>
            )}
          </>
        )}
      </div>

      {dealAberto && (
        <DealDrawer
          dealId={dealAberto}
          onClose={() => setDealAberto(null)}
          onChanged={() => { void carregar(); onMudou(); }}
        />
      )}
    </aside>
  );
}
