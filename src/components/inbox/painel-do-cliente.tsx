"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import {
  Plus, X, Check, Building2, ExternalLink, Clock, UserRoundX, ChevronRight,
} from "lucide-react";
import { DealDrawer } from "@/components/crm/deal-drawer";
import { useConcluirTarefa } from "@/components/tarefas/concluir";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn, formatRelativeDate } from "@/lib/utils";
import { AvatarDoContato } from "./avatar";
import { dinheiro, type Conversa, type Contexto } from "./tipos";
import { useSondagem } from "./use-sondagem";
import { useMudancaDeEtapa } from "@/components/crm/negocios/mudanca-de-etapa";

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
    <section className="flex flex-col gap-2">
      <div className="flex min-h-6 items-center justify-between">
        <h3 className="font-mono text-caption text-text-tertiary">{titulo}</h3>
        {acao}
      </div>
      {children}
    </section>
  );
}

/** Parte da ficha que não precisa estar à vista: abre com um clique, nada some. */
function Recolhivel({
  titulo, contagem, children,
}: {
  titulo: string;
  contagem?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [aberto, setAberto] = React.useState(false);
  const id = React.useId();
  return (
    <section className="border-t border-border-subtle">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        aria-controls={id}
        className="flex w-full items-center gap-1.5 py-2.5 text-left text-small text-text-secondary transition-colors hover:text-text-primary"
      >
        <ChevronRight size={14} className={cn("shrink-0 text-text-tertiary transition-transform duration-120", aberto && "rotate-90")} aria-hidden="true" />
        <span className="flex-1">{titulo}</span>
        {contagem !== undefined && <span className="font-mono text-caption tabular-nums text-text-tertiary">{contagem}</span>}
      </button>
      {aberto && (
        <div id={id} className="pb-3">
          {children}
        </div>
      )}
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

  // Mudança de etapa pelas regras da etapa (motivo da perda, "Complete para
  // mover"): os mesmos modais do quadro.
  const mudanca = useMudancaDeEtapa({ onErro: setErro });
  async function moverEtapa(negocio: { id: string; name: string }, funil: Funil, stageId: string) {
    const para = funil.stages.find((s) => s.id === stageId);
    if (!para) return;
    setErro(null);
    const r = await mudanca.mover({ dealId: negocio.id, nome: negocio.name, pipelineId: funil.id, para, defs: [] });
    await carregar();
    if (r === "movido") onMudou();
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

  // Concluir passa pelo diálogo (resultado + próximo passo obrigatório).
  const { abrir: concluirTarefa, dialogo: dialogoDeConclusao } = useConcluirTarefa(() => {
    void carregar();
  });

  const funilEscolhido = funis.find((f) => f.id === formNegocio.funilId);
  const capturados = Object.entries(contato?.customFields ?? {}).filter(([k]) => !k.startsWith("__"));
  const etiquetasLivres = etiquetas.filter((e) => !contato?.tags.some((t) => t.id === e.id));
  const abertos = (ctx?.negocios ?? []).filter((n) => !n.closedAt);
  const fechados = (ctx?.negocios ?? []).filter((n) => n.closedAt);
  const tarefas = ctx?.tarefas ?? [];
  const atrasadas = tarefas.filter((t) => t.atrasada).length;

  return (
    <aside className={cn("flex min-h-0 flex-col overflow-hidden", className)}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!carregado ? (
          <p className="p-6 text-center text-small text-text-tertiary">Carregando...</p>
        ) : !contato ? (
          <div className="flex flex-col items-center px-5 py-14 text-center">
            <UserRoundX size={20} className="mb-3 text-text-tertiary" aria-hidden="true" />
            <p className="text-body font-medium text-text-primary">Sem ficha de cliente</p>
            <p className="mt-1 max-w-[230px] text-caption text-text-tertiary">
              {conversa.simulado
                ? "Conversas de teste não criam ficha no CRM."
                : "A ficha é criada quando o fluxo roda. Se esta conversa é antiga, ela aparece na próxima mensagem."}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-5 p-3.5">
            <div className="flex items-center gap-2.5">
              <AvatarDoContato chave={conversa.contactId} nome={contato.name || conversa.nome} tamanho="lg" />
              <div className="min-w-0 flex-1">
                <input
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  onBlur={salvarNome}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                  placeholder={conversa.nome}
                  aria-label="Nome do cliente"
                  title="Clique para editar o nome"
                  className="-mx-1 w-[calc(100%+8px)] rounded-md bg-transparent px-1 py-0.5 text-body font-semibold text-text-primary outline-none placeholder:text-text-secondary hover:bg-hover focus:bg-hover"
                />
                {contato.company && (
                  <p className="flex items-center gap-1 truncate text-caption text-text-tertiary">
                    <Building2 size={12} aria-hidden="true" /> {contato.company.name}
                  </p>
                )}
              </div>
              <Link
                href={`/contatos?abrir=${contato.id}`}
                aria-label="Abrir ficha completa"
                title="Abrir ficha completa"
                className={buttonVariants({ variant: "ghost", size: "icon", className: "shrink-0" })}
              >
                <ExternalLink aria-hidden="true" />
              </Link>
            </div>

            {erro && <p className="rounded-[10px] bg-danger-subtle px-3 py-2 text-caption text-danger">{erro}</p>}

            <Secao titulo="Contato">
              <dl className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-2.5 gap-y-2 text-small">
                <dt className="text-text-tertiary">E-mail</dt>
                <dd className={cn("truncate", contato.email ? "text-text-primary" : "text-text-tertiary")} title={contato.email || undefined}>
                  {contato.email || "Sem e-mail"}
                </dd>
                <dt className="text-text-tertiary">Telefone</dt>
                <dd className={cn("truncate tabular-nums", contato.phone ? "text-text-primary" : "text-text-tertiary")}>
                  {contato.phone || "Sem telefone"}
                </dd>
              </dl>
            </Secao>

            <Secao
              titulo="Negócio"
              acao={
                !novoNegocio && (
                  <Button variant="ghost" size="sm" onClick={abrirNovoNegocio} className="-mr-2 h-6 px-2">
                    <Plus size={12} aria-hidden="true" /> Novo
                  </Button>
                )
              }
            >
              {novoNegocio && (
                <div className="mb-2 flex flex-col gap-2 rounded-[10px] border border-border-subtle p-2.5">
                  <Input
                    value={formNegocio.nome}
                    onChange={(e) => setFormNegocio({ ...formNegocio, nome: e.target.value })}
                    placeholder="Nome do negócio"
                    aria-label="Nome do negócio"
                  />
                  <Input
                    value={formNegocio.valor}
                    onChange={(e) => setFormNegocio({ ...formNegocio, valor: e.target.value })}
                    placeholder="Valor (opcional)"
                    inputMode="decimal"
                    aria-label="Valor do negócio"
                  />
                  {funis.length > 1 && (
                    <Select
                      value={formNegocio.funilId}
                      onChange={(e) => {
                        const f = funis.find((x) => x.id === e.target.value);
                        const et = f?.stages.find((x) => x.type === "open") ?? f?.stages[0];
                        setFormNegocio({ ...formNegocio, funilId: e.target.value, etapaId: et?.id ?? "" });
                      }}
                      aria-label="Funil"
                    >
                      {funis.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </Select>
                  )}
                  {funilEscolhido && (
                    <Select
                      value={formNegocio.etapaId}
                      onChange={(e) => setFormNegocio({ ...formNegocio, etapaId: e.target.value })}
                      aria-label="Etapa"
                    >
                      {funilEscolhido.stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                    </Select>
                  )}
                  <div className="flex gap-2">
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={criarNegocio}
                      disabled={!formNegocio.nome.trim()}
                      loading={salvandoNegocio}
                      className="flex-1"
                    >
                      {!salvandoNegocio && <Check size={14} aria-hidden="true" />} Criar
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setNovoNegocio(false)}>
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}

              {abertos.length === 0 && fechados.length === 0 && !novoNegocio && (
                <p className="text-small text-text-tertiary">Nenhum negócio com este cliente ainda.</p>
              )}

              <div className="flex flex-col gap-2">
                {abertos.map((n) => {
                  const funil = funis.find((f) => f.id === n.pipeline.id);
                  // Trilha: quantas etapas abertas do funil o negócio já andou.
                  const etapasAbertas = funil?.stages.filter((s) => s.type === "open") ?? [];
                  const posicao = etapasAbertas.findIndex((s) => s.id === n.stage.id);
                  return (
                    <div key={n.id} className="flex flex-col gap-2 rounded-[10px] border border-border-subtle p-2.5">
                      <button
                        type="button"
                        onClick={() => setDealAberto(n.id)}
                        className="flex w-full items-baseline justify-between gap-2 text-left"
                        title="Abrir o negócio"
                      >
                        <span className="truncate text-small font-medium text-text-primary">{n.name}</span>
                        {n.amountCents > 0 && (
                          <span className="shrink-0 text-small font-semibold tabular-nums text-text-primary">{dinheiro(n.amountCents)}</span>
                        )}
                      </button>
                      {etapasAbertas.length > 1 && posicao >= 0 && (
                        <div className="flex gap-0.5" aria-hidden="true">
                          {etapasAbertas.map((s, i) => (
                            <span key={s.id} className={cn("h-1 flex-1 rounded-full", i <= posicao ? "bg-accent-solid" : "bg-hover")} />
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        {funil ? (
                          <div className="min-w-0 flex-1">
                            <Select
                              value={n.stage.id}
                              onChange={(e) => moverEtapa(n, funil, e.target.value)}
                              aria-label={`Etapa de ${n.name}`}
                              className="h-7 text-small"
                            >
                              {funil.stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                            </Select>
                          </div>
                        ) : (
                          <Badge variant="neutral">{n.stage.name}</Badge>
                        )}
                        <span className="shrink-0 font-mono text-caption tabular-nums text-text-tertiary">{n.probability}%</span>
                      </div>
                    </div>
                  );
                })}

                {fechados.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => setDealAberto(n.id)}
                    className="-mx-1.5 flex items-center justify-between gap-2 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-hover"
                  >
                    <span className="truncate text-small text-text-tertiary">{n.name}</span>
                    <Badge variant={n.stage.type === "won" ? "success" : "danger"}>
                      {n.stage.type === "won" ? "Ganho" : "Perdido"}
                    </Badge>
                  </button>
                ))}
              </div>
            </Secao>

            {/* O resto da ficha fica recolhido: à vista, só contato e negócio. */}
            <div className="flex flex-col">
              <Recolhivel
                titulo="Tarefas"
                contagem={
                  tarefas.length > 0 ? (
                    <span className={cn(atrasadas > 0 && "text-danger")}>{tarefas.length}</span>
                  ) : undefined
                }
              >
                <div className="flex flex-col gap-0.5">
                  {tarefas.map((t) => (
                    <label key={t.id} className="-mx-1.5 flex cursor-pointer items-start gap-2.5 rounded-lg px-1.5 py-1.5 hover:bg-hover">
                      <Checkbox checked={false} onCheckedChange={() => concluirTarefa(t)} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-small text-text-primary">{t.text}</span>
                        {t.dueAt && (
                          <span className={cn("mt-0.5 inline-flex items-center gap-1 text-caption", t.atrasada ? "text-danger" : "text-text-tertiary")}>
                            <Clock size={12} aria-hidden="true" /> {formatRelativeDate(t.dueAt)}
                          </span>
                        )}
                      </span>
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex gap-1.5">
                  <Input
                    value={novaTarefa}
                    onChange={(e) => setNovaTarefa(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && criarTarefa()}
                    placeholder="Nova tarefa para amanhã"
                    aria-label="Nova tarefa"
                    className="min-w-0 flex-1"
                  />
                  <Button
                    variant="secondary"
                    size="icon"
                    onClick={criarTarefa}
                    disabled={!novaTarefa.trim()}
                    aria-label="Adicionar tarefa"
                    className="shrink-0"
                  >
                    <Plus aria-hidden="true" />
                  </Button>
                </div>
              </Recolhivel>

              <Recolhivel titulo="Etiquetas" contagem={contato.tags.length > 0 ? contato.tags.length : undefined}>
                <div className="flex flex-wrap items-center gap-1.5">
                  {contato.tags.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => mexerEtiqueta("removeTagId", t.id)}
                      title="Clique para remover"
                      className="group inline-flex h-6 items-center gap-1 rounded-full border border-border-subtle bg-raised px-2.5 text-caption font-medium text-text-secondary transition-colors hover:bg-danger-subtle hover:text-danger"
                    >
                      {t.name}
                      <X size={12} className="opacity-0 transition-opacity group-hover:opacity-100" aria-hidden="true" />
                    </button>
                  ))}
                  {contato.tags.length === 0 && etiquetasLivres.length === 0 && (
                    <span className="text-small text-text-tertiary">Nenhuma etiqueta criada ainda.</span>
                  )}
                </div>
                {etiquetasLivres.length > 0 && (
                  <div className="mt-2">
                    <Select
                      value=""
                      onChange={(e) => e.target.value && mexerEtiqueta("addTagId", e.target.value)}
                      aria-label="Adicionar etiqueta"
                      className="h-7 text-small"
                    >
                      <option value="">Adicionar etiqueta</option>
                      {etiquetasLivres.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </Select>
                  </div>
                )}
              </Recolhivel>

              {capturados.length > 0 && (
                <Recolhivel titulo="Capturado na conversa" contagem={capturados.length}>
                  <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-small">
                    {capturados.map(([chave, valor]) => (
                      <React.Fragment key={chave}>
                        <dt className="truncate text-text-tertiary">{chave}</dt>
                        <dd className="break-words text-right text-text-primary">{String(valor)}</dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </Recolhivel>
              )}
            </div>
          </div>
        )}
      </div>

      {dealAberto && (
        <DealDrawer
          dealId={dealAberto}
          onClose={() => setDealAberto(null)}
          onChanged={() => { void carregar(); onMudou(); }}
        />
      )}
      {mudanca.elementos}
      {dialogoDeConclusao}
    </aside>
  );
}
