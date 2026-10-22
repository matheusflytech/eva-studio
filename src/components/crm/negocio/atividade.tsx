"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import {
  ArrowRight, CalendarDays, CheckCircle2, CirclePlus, ListTodo, Loader2, MessagesSquare, Plus, StickyNote, ThumbsDown, ThumbsUp, UserPlus, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn, formatRelativeDate } from "@/lib/utils";
import {
  agruparPorDia,
  descreverItem,
  filtrarItens,
  horaEmSP,
  ordenarTarefas,
  rotuloDoTipoDeTarefa,
  tarefaAtrasada,
  type FiltroDaLinhaDoTempo,
  type ItemDaLinhaDoTempo,
} from "./linha-do-tempo";
import { IconeDoCanal, dataLonga } from "./pecas";
import { mensagemDeErro, type NegocioDaFicha } from "./use-ficha";
import { useConcluirTarefa } from "@/components/tarefas/concluir";
import { TIPOS_DE_TAREFA } from "@/lib/tarefas/tipos";

export type AbaDaAtividade = "atividade" | "notas" | "tarefas";

const FILTROS: { id: FiltroDaLinhaDoTempo; rotulo: string }[] = [
  { id: "tudo", rotulo: "Tudo" },
  { id: "etapas", rotulo: "Etapas" },
  { id: "notas", rotulo: "Notas" },
  { id: "tarefas", rotulo: "Tarefas" },
  { id: "conversas", rotulo: "Conversas" },
];

export function AtividadeDoNegocio({
  deal,
  itens,
  linhaFalhou,
  agora,
  aba,
  onAba,
  recarregar,
}: {
  deal: NegocioDaFicha;
  itens: ItemDaLinhaDoTempo[];
  linhaFalhou: boolean;
  agora: Date;
  aba: AbaDaAtividade;
  onAba: (a: AbaDaAtividade) => void;
  recarregar: () => Promise<void>;
}) {
  const notas = itens.filter((i) => i.tipo === "nota");
  const abertas = deal.tasks.filter((t) => !t.doneAt).length;

  return (
    <section aria-label="Atividade do negócio" className="rounded-2xl border border-border-subtle bg-surface-1 p-4">
      <Tabs value={aba} onValueChange={(v) => onAba(v as AbaDaAtividade)}>
        <TabsList aria-label="Seções da atividade">
          <TabsTrigger value="atividade" className="focus-visible:ring-2 focus-visible:ring-accent-500/60">
            Atividade
          </TabsTrigger>
          <TabsTrigger value="notas" className="focus-visible:ring-2 focus-visible:ring-accent-500/60">
            Notas {notas.length > 0 && <span className="ml-1 tabular-nums text-text-tertiary">{notas.length}</span>}
          </TabsTrigger>
          <TabsTrigger value="tarefas" className="focus-visible:ring-2 focus-visible:ring-accent-500/60">
            Tarefas {abertas > 0 && <span className="ml-1 tabular-nums text-text-tertiary">{abertas}</span>}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="atividade" className="mt-4 outline-none">
          <NovaNota vinculo={{ dealId: deal.id }} onCriada={recarregar} compacto />
          <LinhaDoTempoView itens={itens} falhou={linhaFalhou} agora={agora} />
        </TabsContent>

        <TabsContent value="notas" className="mt-4 outline-none">
          <NovaNota vinculo={{ dealId: deal.id }} onCriada={recarregar} />
          {notas.length === 0 ? (
            <Vazio texto="Nenhuma nota ainda. Registre o que foi conversado para o próximo a pegar o negócio." />
          ) : (
            <ul className="mt-4 flex flex-col gap-2.5">
              {notas.map((n) =>
                n.tipo === "nota" ? (
                  <li key={n.id} className="rounded-xl border border-border-subtle bg-surface-2 px-3.5 py-3">
                    <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-text-primary">{n.texto}</p>
                    <p className="mt-1.5 text-[11.5px] text-text-tertiary">
                      {n.autor ?? "Sem autor"} · {dataLonga(n.em)}, {horaEmSP(n.em)}
                    </p>
                  </li>
                ) : null
              )}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="tarefas" className="mt-4 outline-none">
          <TarefasDoNegocio deal={deal} agora={agora} recarregar={recarregar} />
        </TabsContent>
      </Tabs>
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="rounded-xl border border-dashed border-border-subtle px-4 py-6 text-center text-[12.5px] text-text-tertiary">{texto}</p>;
}

// ---- linha do tempo ----

function iconeDoItem(item: ItemDaLinhaDoTempo): { icone: LucideIcon; tom: string } {
  switch (item.tipo) {
    case "criado":
      return { icone: CirclePlus, tom: "bg-accent-soft text-accent-400" };
    case "contato_criado":
      return { icone: UserPlus, tom: "bg-accent-soft text-accent-400" };
    case "etapa":
      if (item.paraTipo === "won") return { icone: ThumbsUp, tom: "bg-emerald-500/12 text-emerald-400" };
      if (item.paraTipo === "lost") return { icone: ThumbsDown, tom: "bg-rose-500/12 text-rose-400" };
      return { icone: ArrowRight, tom: "bg-accent-soft text-accent-400" };
    case "nota":
      return { icone: StickyNote, tom: "bg-amber-400/12 text-amber-300" };
    case "tarefa_criada":
      return { icone: ListTodo, tom: "bg-surface-3 text-text-secondary" };
    case "tarefa_concluida":
      return { icone: CheckCircle2, tom: "bg-emerald-500/12 text-emerald-400" };
    case "conversa":
      return { icone: MessagesSquare, tom: "bg-surface-3" };
  }
}

/**
 * Linha do tempo agrupada por dia, com filtros. Usada também na ficha do
 * contato, onde "Etapas" vira "Negócios" (os itens trazem de qual negócio são).
 */
export function LinhaDoTempoView({
  itens,
  falhou,
  agora,
  rotulos,
}: {
  itens: ItemDaLinhaDoTempo[];
  falhou: boolean;
  agora: Date;
  rotulos?: Partial<Record<FiltroDaLinhaDoTempo, string>>;
}) {
  const [filtro, setFiltro] = React.useState<FiltroDaLinhaDoTempo>("tudo");
  const grupos = React.useMemo(() => agruparPorDia(filtrarItens(itens, filtro), agora), [itens, filtro, agora]);

  if (falhou && itens.length === 0) {
    return <p role="alert" className="mt-4 text-[12.5px] text-danger">Não foi possível carregar a linha do tempo. Recarregue a página.</p>;
  }

  return (
    <div className="mt-4">
      <div role="radiogroup" aria-label="Filtrar atividade" className="flex flex-wrap gap-1">
        {FILTROS.map((f) => {
          const n = f.id === "tudo" ? itens.length : filtrarItens(itens, f.id).length;
          const ativo = filtro === f.id;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => setFiltro(f.id)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium outline-none transition-colors",
                "focus-visible:ring-2 focus-visible:ring-accent-500/60",
                ativo
                  ? "border-accent-500/40 bg-accent-soft text-accent-400"
                  : "border-border-subtle text-text-secondary hover:border-border-default hover:text-text-primary"
              )}
            >
              {rotulos?.[f.id] ?? f.rotulo}
              <span className="tabular-nums text-[11px] opacity-70">{n}</span>
            </button>
          );
        })}
      </div>

      {grupos.length === 0 ? (
        <div className="mt-4">
          <Vazio texto="Nada deste tipo por aqui ainda." />
        </div>
      ) : (
        <ol className="mt-4 flex flex-col gap-5">
          {grupos.map((g) => (
            <li key={g.dia}>
              <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-text-tertiary">{g.rotulo}</h3>
              <ol className="relative flex flex-col">
                {g.itens.map((item, i) => (
                  <ItemDaLinha key={item.id} item={item} ultimo={i === g.itens.length - 1} />
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ItemDaLinha({ item, ultimo }: { item: ItemDaLinhaDoTempo; ultimo: boolean }) {
  const { titulo, detalhe } = descreverItem(item);
  const { icone: Icone, tom } = iconeDoItem(item);

  return (
    <li className="relative flex gap-3 pb-3.5">
      {/* Fio vertical ligando os itens do dia. */}
      {!ultimo && <span aria-hidden className="absolute left-[13px] top-7 bottom-0 w-px bg-border-subtle" />}
      <span className={cn("relative grid h-7 w-7 shrink-0 place-items-center rounded-full", tom)}>
        {item.tipo === "conversa" ? <IconeDoCanal canal={item.canal} tamanho={14} /> : <Icone size={14} aria-hidden />}
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="min-w-0 text-[13px] font-medium text-text-primary">
            {item.tipo === "conversa" ? (
              <Link
                href={`/conversas?c=${item.conversaId}`}
                className="rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent-500/60"
              >
                {titulo}
              </Link>
            ) : (item.tipo === "criado" || item.tipo === "etapa") && item.negocio ? (
              <Link
                href={`/negocios/${item.negocio.id}`}
                className="rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-accent-500/60"
              >
                {titulo}
              </Link>
            ) : (
              titulo
            )}
          </p>
          <time dateTime={item.em} className="shrink-0 text-[11.5px] tabular-nums text-text-tertiary">
            {horaEmSP(item.em)}
          </time>
        </div>
        {detalhe && (
          <p
            className={cn(
              "mt-0.5 text-[12.5px] text-text-secondary",
              item.tipo === "nota" ? "whitespace-pre-wrap rounded-lg bg-surface-2 px-3 py-2 leading-relaxed" : "truncate"
            )}
          >
            {detalhe}
          </p>
        )}
        {item.tipo === "tarefa_criada" && item.prazo && (
          <p className="mt-0.5 inline-flex items-center gap-1 text-[11.5px] text-text-tertiary">
            <CalendarDays size={11} aria-hidden /> Prazo {dataLonga(item.prazo)}
          </p>
        )}
      </div>
    </li>
  );
}

// ---- notas ----

/** Composer de nota, preso ao negócio ou ao contato (POST /api/notes aceita os dois). */
export function NovaNota({
  vinculo,
  onCriada,
  compacto,
}: {
  vinculo: { dealId: string } | { contactId: string };
  onCriada: () => Promise<void>;
  compacto?: boolean;
}) {
  const [texto, setTexto] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aberto, setAberto] = React.useState(!compacto);
  const id = React.useId();

  async function salvar() {
    const t = texto.trim();
    if (!t || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, ...vinculo }),
      });
      if (!res.ok) {
        setErro(await mensagemDeErro(res, "Não foi possível registrar a nota."));
        return;
      }
      setTexto("");
      if (compacto) setAberto(false);
      await onCriada();
    } catch {
      setErro("Sem conexão. A nota não foi salva.");
    } finally {
      setSalvando(false);
    }
  }

  // Na aba Atividade o composer fica fechado até ser chamado: a linha do
  // tempo é o que se lê ali, e uma caixa grande no topo empurra tudo para baixo.
  if (!aberto) {
    return (
      <button
        type="button"
        onClick={() => setAberto(true)}
        className="flex h-10 w-full items-center gap-2 rounded-xl border border-border-subtle bg-surface-2 px-3.5 text-left text-[13px] text-text-tertiary outline-none transition-colors hover:border-border-default focus-visible:ring-2 focus-visible:ring-accent-500/60"
      >
        <StickyNote size={14} aria-hidden /> Registrar uma nota...
      </button>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        Nova nota
      </label>
      <Textarea
        id={id}
        rows={3}
        autoFocus={compacto}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            salvar();
          }
          if (e.key === "Escape" && compacto && !texto.trim()) setAberto(false);
        }}
        placeholder="O que aconteceu? Combinados, objeções, próximos passos..."
        className="text-[13px]"
      />
      {erro && <p role="alert" className="mt-1.5 text-[12px] text-danger">{erro}</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="hidden text-[11.5px] text-text-tertiary sm:inline">Ctrl + Enter para salvar</span>
        <div className="ml-auto flex gap-2">
          {compacto && (
            <Button variant="ghost" size="sm" onClick={() => { setAberto(false); setErro(null); }}>
              Cancelar
            </Button>
          )}
          <Button size="sm" onClick={salvar} disabled={!texto.trim() || salvando}>
            {salvando ? <Loader2 size={14} className="animate-spin" /> : <StickyNote size={14} aria-hidden />} Registrar nota
          </Button>
        </div>
      </div>
    </div>
  );
}

// ---- tarefas ----

const TIPOS = TIPOS_DE_TAREFA;

function TarefasDoNegocio({ deal, agora, recarregar }: { deal: NegocioDaFicha; agora: Date; recarregar: () => Promise<void> }) {
  const [texto, setTexto] = React.useState("");
  const [tipo, setTipo] = React.useState<(typeof TIPOS)[number]>("ligar");
  const [prazo, setPrazo] = React.useState("");
  const [salvando, setSalvando] = React.useState(false);
  const [alternando, setAlternando] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const tarefas = ordenarTarefas(deal.tasks);

  async function criar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t || salvando) return;
    setSalvando(true);
    setErro(null);
    try {
      const res = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: t, type: tipo, dealId: deal.id, dueAt: prazo || null }),
      });
      if (!res.ok) {
        setErro(await mensagemDeErro(res, "Não foi possível criar a tarefa."));
        return;
      }
      setTexto("");
      setPrazo("");
      await recarregar();
    } catch {
      setErro("Sem conexão. A tarefa não foi criada.");
    } finally {
      setSalvando(false);
    }
  }

  // Concluir abre o diálogo (resultado + próximo passo obrigatório);
  // desmarcar reabre direto.
  const { abrir: abrirConclusao, dialogo } = useConcluirTarefa(() => {
    recarregar();
  });

  async function alternar(t: { id: string; type: string; text: string }, feita: boolean) {
    if (!feita) {
      abrirConclusao(t);
      return;
    }
    const id = t.id;
    setAlternando(id);
    setErro(null);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: false }),
      });
      if (!res.ok) setErro(await mensagemDeErro(res, "Não foi possível atualizar a tarefa."));
      await recarregar();
    } catch {
      setErro("Sem conexão. Tente de novo.");
    } finally {
      setAlternando(null);
    }
  }

  return (
    <div>
      <form onSubmit={criar} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_130px_150px_auto]">
        <label htmlFor="ficha-tarefa" className="sr-only">
          Descrição da tarefa
        </label>
        <Input
          id="ficha-tarefa"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Nova tarefa..."
          className="h-9 rounded-lg text-[13px]"
        />
        <label htmlFor="ficha-tarefa-tipo" className="sr-only">
          Tipo da tarefa
        </label>
        <Select
          id="ficha-tarefa-tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as (typeof TIPOS)[number])}
          className="h-9 rounded-lg text-[13px]"
        >
          {TIPOS.map((t) => (
            <option key={t} value={t}>
              {rotuloDoTipoDeTarefa(t)}
            </option>
          ))}
        </Select>
        <label htmlFor="ficha-tarefa-prazo" className="sr-only">
          Prazo
        </label>
        <Input
          id="ficha-tarefa-prazo"
          type="date"
          value={prazo}
          onChange={(e) => setPrazo(e.target.value)}
          className="h-9 rounded-lg text-[13px] [color-scheme:dark]"
        />
        <Button type="submit" size="sm" className="h-9" disabled={!texto.trim() || salvando}>
          {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} aria-hidden />} Criar
        </Button>
      </form>
      {erro && <p role="alert" className="mt-2 text-[12px] text-danger">{erro}</p>}

      {tarefas.length === 0 ? (
        <div className="mt-4">
          <Vazio texto="Sem tarefas. Todo negócio aberto deveria ter um próximo passo com data." />
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-1">
          {tarefas.map((t) => {
            const atrasada = tarefaAtrasada(t, agora);
            const idDoCheck = `tarefa-${t.id}`;
            return (
              <li key={t.id} className="flex items-start gap-3 rounded-xl px-2.5 py-2 hover:bg-surface-2">
                <Checkbox
                  id={idDoCheck}
                  checked={!!t.doneAt}
                  disabled={alternando === t.id}
                  onCheckedChange={() => alternar(t, !!t.doneAt)}
                  aria-label={t.doneAt ? `Reabrir tarefa: ${t.text}` : `Concluir tarefa: ${t.text}`}
                  className="mt-0.5 focus-visible:ring-2 focus-visible:ring-accent-500/60"
                />
                <label htmlFor={idDoCheck} className="min-w-0 flex-1 cursor-pointer">
                  <span className={cn("block text-[13px]", t.doneAt ? "text-text-tertiary line-through" : "text-text-primary")}>{t.text}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-text-tertiary">
                    <span>{rotuloDoTipoDeTarefa(t.type)}</span>
                    {t.doneAt ? (
                      <span>· concluída {formatRelativeDate(t.doneAt)}</span>
                    ) : (
                      t.dueAt && (
                        <span className={cn("inline-flex items-center gap-1", atrasada && "text-danger")}>
                          · <CalendarDays size={11} aria-hidden /> {atrasada ? "atrasada, " : ""}
                          {dataLonga(t.dueAt)}
                        </span>
                      )
                    )}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {dialogo}
    </div>
  );
}
