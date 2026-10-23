"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import {
  ArrowRight, CalendarDays, CheckCircle2, CirclePlus, ListTodo, Loader2, MessagesSquare, PenLine, Plus, StickyNote, UserPlus, XCircle, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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
import { IconeDoAtor, ListaDeMudancas } from "@/components/historico/pecas";

/** Mantido por compatibilidade: a ficha v5 troca as abas pelo filtro da linha do tempo. */
export type AbaDaAtividade = "atividade" | "notas" | "tarefas";

const FILTROS: { id: FiltroDaLinhaDoTempo; rotulo: string }[] = [
  { id: "tudo", rotulo: "Tudo" },
  { id: "conversas", rotulo: "Conversas" },
  { id: "notas", rotulo: "Notas" },
  { id: "etapas", rotulo: "Etapas" },
  { id: "tarefas", rotulo: "Tarefas" },
  { id: "alteracoes", rotulo: "Alterações" },
];

/**
 * Filtro da linha do tempo em cápsula escura, preso na borda de cima da
 * folha (v5). A borda em volta é a cor do fundo da página, para a cápsula
 * parecer encaixada na folha.
 */
export function FiltroNaBorda({
  itens,
  filtro,
  onFiltro,
  className,
}: {
  itens: ItemDaLinhaDoTempo[];
  filtro: FiltroDaLinhaDoTempo;
  onFiltro: (f: FiltroDaLinhaDoTempo) => void;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex max-w-full rounded-full bg-page p-1", className)}>
      <span data-theme="dark" role="radiogroup" aria-label="Filtrar a linha do tempo" className="flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-panel p-1 [scrollbar-width:none]">
        {FILTROS.map((f) => {
          const n = f.id === "tudo" ? itens.length : filtrarItens(itens, f.id).length;
          const ativo = filtro === f.id;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={ativo}
              onClick={() => onFiltro(f.id)}
              className={cn(
                "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full px-3 text-small font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-focus",
                ativo ? "bg-inverse text-inverse-fg" : "text-text-secondary hover:text-text-primary"
              )}
            >
              {f.rotulo}
              <span className="font-mono text-caption tabular-nums opacity-70">{n}</span>
            </button>
          );
        })}
      </span>
    </span>
  );
}

/**
 * Linha do tempo do negócio (v5, dentro da folha): o filtro mora na borda da
 * folha (FiltroNaBorda); "Tarefas" também traz a lista para criar e concluir;
 * o composer de nota fica preso embaixo enquanto se lê.
 */
export function AtividadeDoNegocio({
  deal,
  itens,
  linhaFalhou,
  agora,
  filtro,
  recarregar,
}: {
  deal: NegocioDaFicha;
  itens: ItemDaLinhaDoTempo[];
  linhaFalhou: boolean;
  agora: Date;
  filtro: FiltroDaLinhaDoTempo;
  recarregar: () => Promise<void>;
}) {
  const abertas = deal.tasks.filter((t) => !t.doneAt).length;
  return (
    <section aria-label="Atividade do negócio" className="flex min-w-0 flex-col">
      <h2 className="mx-2 mb-1 flex justify-between font-mono text-caption text-text-tertiary">
        <span>{filtro === "tarefas" ? "Tarefas" : "Linha do tempo"}</span>
        {filtro === "tarefas" ? <span>{abertas} abertas</span> : <span>{itens.length} acontecimentos</span>}
      </h2>
      {filtro === "tarefas" && (
        <div className="mb-4 px-2">
          <TarefasDoNegocio deal={deal} agora={agora} recarregar={recarregar} />
        </div>
      )}
      <LinhaDoTempoView itens={itens} falhou={linhaFalhou} agora={agora} filtro={filtro} semFiltros destacarConversa />
      <div className="sticky bottom-3 z-10 mt-4">
        <NovaNota vinculo={{ dealId: deal.id }} onCriada={recarregar} compacto />
      </div>
    </section>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <p className="rounded-[14px] border border-dashed border-border-subtle px-4 py-6 text-center text-small text-text-tertiary">{texto}</p>;
}

// ---- linha do tempo ----

// Cor só em status (ganho, perdido, concluída); o resto é neutro.
function iconeDoItem(item: ItemDaLinhaDoTempo): { icone: LucideIcon; tom: string } {
  switch (item.tipo) {
    case "criado":
      return { icone: CirclePlus, tom: "bg-raised text-text-secondary" };
    case "contato_criado":
      return { icone: UserPlus, tom: "bg-raised text-text-secondary" };
    case "etapa":
      if (item.paraTipo === "won") return { icone: CheckCircle2, tom: "bg-success-subtle text-success" };
      if (item.paraTipo === "lost") return { icone: XCircle, tom: "bg-danger-subtle text-danger" };
      return { icone: ArrowRight, tom: "bg-raised text-text-secondary" };
    case "nota":
      return { icone: StickyNote, tom: "bg-raised text-text-secondary" };
    case "tarefa_criada":
      return { icone: ListTodo, tom: "bg-raised text-text-secondary" };
    case "tarefa_concluida":
      return { icone: CheckCircle2, tom: "bg-success-subtle text-success" };
    case "conversa":
      return { icone: MessagesSquare, tom: "bg-raised" };
    case "alteracao":
      return { icone: PenLine, tom: "bg-raised text-text-secondary" };
  }
}

/**
 * Linha do tempo agrupada por dia, com filtros. Usada também na ficha do
 * contato, onde "Etapas" vira "Negócios" (os itens trazem de qual negócio são).
 * Com `filtro` (e `semFiltros`), quem filtra é a tela (a folha da ficha).
 */
export function LinhaDoTempoView({
  itens,
  falhou,
  agora,
  rotulos,
  filtro: filtroDeFora,
  semFiltros = false,
  destacarConversa = false,
}: {
  itens: ItemDaLinhaDoTempo[];
  falhou: boolean;
  agora: Date;
  rotulos?: Partial<Record<FiltroDaLinhaDoTempo, string>>;
  filtro?: FiltroDaLinhaDoTempo;
  /** Não mostra os botões de filtro (a tela mostra os seus). */
  semFiltros?: boolean;
  /** A conversa mais recente sai destacada (folha da ficha do negócio). */
  destacarConversa?: boolean;
}) {
  const [filtroInterno, setFiltro] = React.useState<FiltroDaLinhaDoTempo>("tudo");
  const filtro = filtroDeFora ?? filtroInterno;
  const grupos = React.useMemo(() => agruparPorDia(filtrarItens(itens, filtro), agora), [itens, filtro, agora]);
  const conversaDestacada = destacarConversa ? grupos.flatMap((g) => g.itens).find((i) => i.tipo === "conversa")?.id : undefined;

  if (falhou && itens.length === 0) {
    return <p role="alert" className="mt-4 text-small text-danger">Não foi possível carregar a linha do tempo. Recarregue a página.</p>;
  }

  return (
    <div className={cn(!semFiltros && "mt-4")}>
      {!semFiltros && (
        <div role="radiogroup" aria-label="Filtrar atividade" className="mb-4 flex flex-wrap gap-1">
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
                  "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-caption font-medium outline-none transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-focus",
                  ativo ? "bg-inverse text-inverse-fg" : "text-text-secondary hover:bg-hover hover:text-text-primary"
                )}
              >
                {rotulos?.[f.id] ?? f.rotulo}
                <span className="font-mono tabular-nums opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
      )}

      {grupos.length === 0 ? (
        <Vazio texto="Nada deste tipo por aqui ainda." />
      ) : (
        <ol className="flex flex-col gap-4">
          {grupos.map((g) => (
            <li key={g.dia}>
              <h3 className="mx-2 mb-1 font-mono text-caption text-text-tertiary">{g.rotulo}</h3>
              <ol className="flex flex-col gap-0.5">
                {g.itens.map((item) => (
                  <ItemDaLinha key={item.id} item={item} destacado={item.id === conversaDestacada} />
                ))}
              </ol>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Uma linha por acontecimento: ícone, o que foi (e quem), detalhe e a hora. */
function ItemDaLinha({ item, destacado }: { item: ItemDaLinhaDoTempo; destacado: boolean }) {
  const { titulo, detalhe } = descreverItem(item);
  const { icone: Icone, tom } = iconeDoItem(item);
  const nota = item.tipo === "nota";

  return (
    <li className={cn("flex gap-3 rounded-[14px] px-2.5 py-2 transition-colors", destacado ? "bg-inverse text-inverse-fg" : "hover:bg-raised")}>
      {item.tipo === "alteracao" ? (
        // Quem alterou: as iniciais da pessoa, ou o ícone do agente/automação/API.
        <IconeDoAtor tipo={item.ator.tipo} nome={item.ator.nome} />
      ) : (
        <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", destacado ? "bg-inverse-fg/10 text-inverse-fg" : tom)}>
          {item.tipo === "conversa" ? <IconeDoCanal canal={item.canal} tamanho={15} /> : <Icone size={15} aria-hidden />}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className={cn("min-w-0 truncate text-small font-semibold", destacado ? "text-inverse-fg" : "text-text-primary")}>
            {item.tipo === "conversa" ? (
              <Link href={`/conversas?c=${item.conversaId}`} className="rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus">
                {titulo}
              </Link>
            ) : (item.tipo === "criado" || item.tipo === "etapa") && item.negocio ? (
              <Link href={`/negocios/${item.negocio.id}`} className="rounded outline-none hover:underline focus-visible:ring-2 focus-visible:ring-focus">
                {titulo}
              </Link>
            ) : (
              titulo
            )}
          </p>
          <time dateTime={item.em} className={cn("shrink-0 font-mono text-caption tabular-nums", destacado ? "text-inverse-fg/70" : "text-text-tertiary")}>
            {horaEmSP(item.em)}
          </time>
        </div>
        {detalhe && (
          <p
            className={cn(
              "text-caption",
              destacado ? "text-inverse-fg/70" : "text-text-secondary",
              nota ? "mt-1 whitespace-pre-wrap leading-relaxed" : "truncate"
            )}
          >
            {detalhe}
          </p>
        )}
        {item.tipo === "alteracao" && <ListaDeMudancas mudancas={item.mudancas} className="mt-1" />}
        {item.tipo === "tarefa_criada" && item.prazo && (
          <p className="mt-0.5 inline-flex items-center gap-1 text-caption text-text-tertiary">
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
        className="flex h-10 w-full items-center gap-2 rounded-full bg-raised pl-4 pr-1.5 text-left text-small text-text-tertiary shadow-overlay outline-none ring-1 ring-inset ring-border-subtle transition-colors hover:bg-hover focus-visible:ring-2 focus-visible:ring-focus"
      >
        <StickyNote size={14} aria-hidden /> Registrar uma nota...
        <span aria-hidden className="ml-auto inline-flex h-7 items-center rounded-full bg-accent-solid px-3 text-caption font-medium text-text-on-accent">
          Escrever
        </span>
      </button>
    );
  }

  return (
    // Superfície própria: aberto, o composer pode ficar preso sobre a linha do tempo.
    <div className={cn(compacto && "rounded-[18px] border border-border-subtle bg-panel p-2.5 shadow-overlay")}>
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
        className="text-small"
      />
      {erro && <p role="alert" className="mt-1.5 text-caption text-danger">{erro}</p>}
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="hidden text-caption text-text-tertiary sm:inline">Ctrl + Enter para salvar</span>
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
          className="h-9 rounded-lg text-small"
        />
        <label htmlFor="ficha-tarefa-tipo" className="sr-only">
          Tipo da tarefa
        </label>
        <Select
          id="ficha-tarefa-tipo"
          value={tipo}
          onChange={(e) => setTipo(e.target.value as (typeof TIPOS)[number])}
          className="h-9 rounded-lg text-small"
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
          className="h-9 rounded-lg text-small"
        />
        <Button type="submit" size="sm" className="h-9" disabled={!texto.trim() || salvando}>
          {salvando ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} aria-hidden />} Criar
        </Button>
      </form>
      {erro && <p role="alert" className="mt-2 text-caption text-danger">{erro}</p>}

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
              <li key={t.id} className="flex items-start gap-3 rounded-xl px-2.5 py-2 hover:bg-hover">
                <Checkbox
                  id={idDoCheck}
                  checked={!!t.doneAt}
                  disabled={alternando === t.id}
                  onCheckedChange={() => alternar(t, !!t.doneAt)}
                  aria-label={t.doneAt ? `Reabrir tarefa: ${t.text}` : `Concluir tarefa: ${t.text}`}
                  className="mt-0.5 focus-visible:ring-2 focus-visible:ring-focus"
                />
                <label htmlFor={idDoCheck} className="min-w-0 flex-1 cursor-pointer">
                  <span className={cn("block text-small", t.doneAt ? "text-text-tertiary line-through" : "text-text-primary")}>{t.text}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption text-text-tertiary">
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
