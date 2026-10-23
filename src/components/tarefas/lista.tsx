"use client";

import * as React from "react";
import { CalendarDays, ChevronDown, ChevronRight, CircleCheck, ListFilter, UserRound, X } from "lucide-react";
import Link from "@/components/contrato/link";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { Skeleton } from "@/components/ui/skeleton";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Field, Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { pulsar } from "@/lib/fundo/eventos";
import { useToast } from "@/components/ui/toast";
import { agruparTarefas } from "@/lib/tarefas/agrupar";
import { ROTULO_DA_VISAO, type VisaoDeTarefas } from "@/lib/tarefas/escopo";
import { RESULTADOS, ROTULO_DO_RESULTADO, type ResultadoDaTarefa } from "@/lib/tarefas/tipos";
import type { TarefaDaTela } from "@/lib/tarefas/tela";
import { LinhaDeTarefa } from "./linha";
import { useConcluirTarefa } from "./concluir";
import type { Moldura } from "./pecas";
import { FilaDeTrabalho } from "./fila";
import { ColunaDoDia, itensDaFila, useMeuDia } from "./coluna-do-dia";
import type { ItemDoDiaDaTela } from "@/lib/tarefas/tela";

// Lista de tarefas (skill crm-tasks-agenda, E7): Atrasadas · Hoje · Amanhã ·
// Esta semana · Depois · Sem data · Concluídas (recolhida). Minhas / Equipe /
// Todas (até o teto do papel) moram em "Filtros". Ações em massa: reagendar
// (+1 dia, segunda), reatribuir e concluir.

interface Membro {
  id: string;
  name: string;
}

export type Resposta =
  | { ok: true; dados: { tasks?: TarefaDaTela[]; visoes?: VisaoDeTarefas[]; visao?: VisaoDeTarefas } }
  | { ok: false; erro: string };

/** Mesma busca serve à lista e ao Calendário (a rota não filtra por data: traz até 300, abertas primeiro). */
/** `intervalo` (dias de SP, inclusivos): só prazos no intervalo — o mês do calendário. */
export async function buscarTarefas(visao: VisaoDeTarefas, intervalo?: { de: string; ate: string }): Promise<Resposta> {
  try {
    const q = new URLSearchParams({ visao, status: "todas", ...intervalo });
    const res = await fetch(`/api/tasks?${q}`);
    const dados = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, dados } : { ok: false, erro: dados.error ?? "Não foi possível carregar as tarefas." };
  } catch {
    return { ok: false, erro: "Sem conexão." };
  }
}

export function ListaDeTarefas({ versao, onMudou, moldura }: { versao: number; onMudou: () => void; moldura: Moldura }) {
  const toast = useToast();
  const [visao, setVisao] = React.useState<VisaoDeTarefas>("minhas");
  const [visoes, setVisoes] = React.useState<VisaoDeTarefas[]>(["minhas"]);
  const [tarefas, setTarefas] = React.useState<TarefaDaTela[] | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [selecao, setSelecao] = React.useState<Set<string>>(new Set());
  const [verConcluidas, setVerConcluidas] = React.useState(false);
  const [membros, setMembros] = React.useState<Membro[]>([]);
  const [concluirEmMassa, setConcluirEmMassa] = React.useState(false);
  const [agora, setAgora] = React.useState(() => new Date());
  // Coluna da direita (desktop largo): capacidade, filas e compromissos do Meu dia.
  const dia = useMeuDia(versao);
  const [fila, setFila] = React.useState<{ titulo: string; itens: ItemDoDiaDaTela[] } | null>(null);

  // Busca sem mexer em estado; o estado só muda no .then (o efeito apenas
  // sincroniza com o servidor).
  const aplicar = React.useCallback(
    (r: Resposta) => {
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setErro(null);
      setTarefas(r.dados.tasks ?? []);
      setVisoes(r.dados.visoes ?? ["minhas"]);
      if (r.dados.visao && r.dados.visao !== visao) setVisao(r.dados.visao);
      setAgora(new Date());
    },
    [visao]
  );

  const carregar = React.useCallback(() => buscarTarefas(visao).then(aplicar), [visao, aplicar]);

  React.useEffect(() => {
    let vivo = true;
    buscarTarefas(visao).then((r) => vivo && aplicar(r));
    return () => {
      vivo = false;
    };
  }, [visao, versao, aplicar]);

  React.useEffect(() => {
    fetch("/api/members")
      .then((r) => r.json())
      .then((d) => setMembros((d.members ?? []).map((m: Membro) => ({ id: m.id, name: m.name }))))
      .catch(() => {});
  }, []);

  const mudou = React.useCallback(() => {
    carregar();
    onMudou();
  }, [carregar, onMudou]);

  // Concluiu: o fundo pulsa a partir do círculo clicado.
  const origemDoPulso = React.useRef<HTMLElement | null>(null);
  const { abrir, dialogo } = useConcluirTarefa(() => {
    pulsar(origemDoPulso.current, 1.2);
    mudou();
  });
  const abrirConclusao = (t: TarefaDaTela, el?: HTMLElement) => {
    origemDoPulso.current = el ?? null;
    abrir(t);
  };

  async function reabrir(t: TarefaDaTela) {
    const res = await fetch(`/api/tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done: false }) });
    if (!res.ok) toast({ title: "Não foi possível reabrir.", tone: "danger" });
    mudou();
  }

  async function emMassa(corpo: Record<string, unknown>, sucesso: string) {
    const ids = [...selecao];
    const res = await fetch("/api/tasks/massa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, ...corpo }) });
    const dados = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast({ title: dados.error ?? "Não foi possível aplicar.", tone: "danger" });
      return false;
    }
    toast({
      title: `${dados.alteradas} ${dados.alteradas === 1 ? "tarefa" : "tarefas"}: ${sucesso}`,
      description: dados.ignoradas ? `${dados.ignoradas} ficaram de fora (concluídas ou fora do seu escopo).` : undefined,
      tone: "success",
    });
    setSelecao(new Set());
    mudou();
    return true;
  }

  const grupos = React.useMemo(() => (tarefas ? agruparTarefas(tarefas, agora) : []), [tarefas, agora]);
  const abertas = tarefas?.filter((t) => !t.doneAt) ?? [];
  const atrasadas = abertas.filter((t) => t.overdue).length;

  function alternar(id: string, v: boolean) {
    setSelecao((s) => {
      const n = new Set(s);
      if (v) n.add(id);
      else n.delete(id);
      return n;
    });
  }

  // Filtros: hoje só "de quem" (Minhas, Equipe, Todas), dentro do botão.
  const lateral = (
    <FiltroDeQuem
      visoes={visoes}
      visao={visao}
      onEscolher={(v) => {
        setSelecao(new Set());
        setVisao(v);
      }}
    />
  );

  const contagem =
    tarefas === null ? null : (
      <>
        {abertas.length} {abertas.length === 1 ? "aberta" : "abertas"}
        {atrasadas > 0 && (
          <span className="text-danger">
            {" "}
            · {atrasadas} atrasada{atrasadas === 1 ? "" : "s"}
          </span>
        )}
      </>
    );

  if (fila) {
    return moldura({
      contagem,
      conteudo: (
        <FilaDeTrabalho
          titulo={fila.titulo}
          itens={fila.itens}
          onMudou={onMudou}
          onSair={() => {
            setFila(null);
            carregar();
          }}
        />
      ),
    });
  }

  return moldura({
    contagem,
    lateral,
    coluna: dia ? (
      <ColunaDoDia
        dia={dia}
        agora={agora}
        onAbrirFila={(titulo, ids) => {
          const itens = itensDaFila(dia, ids);
          if (itens.length) setFila({ titulo, itens });
        }}
      />
    ) : null,
    conteudo: (
      <div className="flex flex-col gap-4">
        {selecao.size > 0 && (
          <div role="region" aria-label="Ações em massa" className="flex flex-wrap items-center gap-2 rounded-[14px] border border-border-subtle bg-raised px-3 py-2">
            <span className="font-mono text-caption tabular-nums text-text-primary">
              {selecao.size} selecionada{selecao.size === 1 ? "" : "s"}
            </span>
            <Button size="sm" variant="secondary" onClick={() => emMassa({ acao: "reagendar", para: "mais_1d" }, "+1 dia")}>
              <CalendarDays size={14} aria-hidden /> +1 dia
            </Button>
            <Button size="sm" variant="secondary" onClick={() => emMassa({ acao: "reagendar", para: "segunda" }, "para segunda 9h")}>
              <CalendarDays size={14} aria-hidden /> Próxima segunda
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="secondary">
                  <UserRound size={14} aria-hidden /> Reatribuir <ChevronDown size={14} aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="max-h-72 overflow-y-auto">
                <DropdownMenuGroup>
                  {membros.map((m) => (
                    <DropdownMenuItem key={m.id} onSelect={() => emMassa({ acao: "reatribuir", responsavelId: m.id }, `agora com ${m.name}`)}>
                      {m.name}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuItem onSelect={() => emMassa({ acao: "reatribuir", responsavelId: null }, "sem responsável")}>Sem responsável</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="secondary" onClick={() => setConcluirEmMassa(true)}>
              <CircleCheck size={14} aria-hidden /> Concluir
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelecao(new Set())} className="ml-auto">
              <X size={14} aria-hidden /> Limpar seleção
            </Button>
          </div>
        )}

        {erro && <p role="alert" className="text-small text-danger">{erro}</p>}

        {tarefas === null ? (
          <div className="flex flex-col gap-2" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-11 rounded-[14px]" />
            ))}
          </div>
        ) : tarefas.length === 0 ? (
          <div className="rounded-[18px] border border-border-subtle bg-panel px-5 py-8 text-center">
            <p className="text-body font-medium text-text-primary">Nada para fazer.</p>
            <p className="mt-1 text-small text-text-secondary">
              Crie uma tarefa (atalho T) ou{" "}
              <Link href="/negocios" className="font-medium text-accent-fg hover:underline">
                revise os negócios parados
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {grupos.map((g) => {
              const recolhido = g.grupo === "concluidas" && !verConcluidas;
              const idsDoGrupo = g.itens.map((t) => t.id);
              const todos = idsDoGrupo.every((id) => selecao.has(id));
              const alguns = !todos && idsDoGrupo.some((id) => selecao.has(id));
              return (
                <section key={g.grupo} aria-labelledby={`grupo-${g.grupo}`}>
                  <header className="flex min-h-7 items-center gap-2 px-2 pb-1">
                    {g.grupo !== "concluidas" && (
                      <Checkbox
                        checked={todos ? true : alguns ? "indeterminate" : false}
                        onCheckedChange={(v) =>
                          setSelecao((s) => {
                            const n = new Set(s);
                            for (const id of idsDoGrupo) {
                              if (v === true) n.add(id);
                              else n.delete(id);
                            }
                            return n;
                          })
                        }
                        aria-label={`Selecionar ${g.rotulo}`}
                      />
                    )}
                    {g.grupo === "concluidas" ? (
                      <button
                        type="button"
                        onClick={() => setVerConcluidas((v) => !v)}
                        aria-expanded={!recolhido}
                        className="inline-flex items-center gap-1 rounded-sm font-mono text-caption text-text-tertiary hover:text-text-primary"
                      >
                        {recolhido ? <ChevronRight size={13} aria-hidden /> : <ChevronDown size={13} aria-hidden />}
                        <span id={`grupo-${g.grupo}`}>{g.rotulo}</span>
                      </button>
                    ) : (
                      <h2 id={`grupo-${g.grupo}`} className={cn("font-mono text-caption", g.grupo === "atrasadas" ? "text-danger" : "text-text-tertiary")}>
                        {g.rotulo}
                      </h2>
                    )}
                    <span className="font-mono text-caption tabular-nums text-text-tertiary">{g.itens.length}</span>
                  </header>
                  {!recolhido && (
                    <ul>
                      {g.itens.map((t) => (
                        <LinhaDeTarefa
                          key={t.id}
                          tarefa={t}
                          agora={agora}
                          selecionada={selecao.has(t.id)}
                          onSelecionar={t.doneAt ? undefined : (v) => alternar(t.id, v)}
                          onConcluir={abrirConclusao}
                          onReabrir={reabrir}
                          onMudou={mudou}
                        />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {dialogo}
        {concluirEmMassa && (
          <ConcluirEmMassa
            quantidade={selecao.size}
            onFechar={() => setConcluirEmMassa(false)}
            onConfirmar={async (resultado, nota) => {
              const ok = await emMassa({ acao: "concluir", resultado, nota, proximo: { decisao: "sem_proximo" } }, "concluídas");
              if (ok) setConcluirEmMassa(false);
            }}
          />
        )}
      </div>
    ),
  });
}

/** "De quem" (Minhas, Equipe, Todas, até o teto do papel) dentro do botão Filtros. Só aparece com mais de uma opção. */
export function FiltroDeQuem({
  visoes,
  visao,
  onEscolher,
}: {
  visoes: VisaoDeTarefas[];
  visao: VisaoDeTarefas;
  onEscolher: (v: VisaoDeTarefas) => void;
}) {
  if (visoes.length <= 1) return null;
  const nFiltros = visao !== "minhas" ? 1 : 0;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="secondary" size="sm" aria-label={nFiltros ? `Filtros, ${nFiltros} ligado` : "Filtros"}>
          <ListFilter size={14} aria-hidden="true" />
          Filtros
          {nFiltros > 0 && <span className="font-mono text-caption tabular-nums text-accent-fg">{nFiltros}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>De quem</DropdownMenuLabel>
        {visoes.map((v) => (
          <DropdownMenuCheckboxItem
            key={v}
            checked={v === visao}
            onCheckedChange={() => {
              if (v !== visao) onEscolher(v);
            }}
          >
            {ROTULO_DA_VISAO[v]}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ConcluirEmMassa({
  quantidade,
  onFechar,
  onConfirmar,
}: {
  quantidade: number;
  onFechar: () => void;
  onConfirmar: (resultado: ResultadoDaTarefa, nota: string) => Promise<void>;
}) {
  const [resultado, setResultado] = React.useState<ResultadoDaTarefa | null>(null);
  const [nota, setNota] = React.useState("");
  const [semProximo, setSemProximo] = React.useState(false);
  const [enviando, setEnviando] = React.useState(false);
  const idSem = React.useId();
  return (
    <Modal open onOpenChange={(a) => !a && onFechar()}>
      <ModalContent
        title={`Concluir ${quantidade} ${quantidade === 1 ? "tarefa" : "tarefas"}`}
        description="Para agendar a próxima atividade de cada uma, conclua uma a uma."
        footer={
          <>
            <Button variant="ghost" onClick={onFechar}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              disabled={!resultado || !semProximo}
              loading={enviando}
              onClick={async () => {
                if (!resultado) return;
                setEnviando(true);
                await onConfirmar(resultado, nota);
                setEnviando(false);
              }}
            >
              Concluir
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="text-small font-medium text-text-primary">Resultado</span>
            <SegmentedControl
              label="Resultado"
              value={resultado ?? ("" as ResultadoDaTarefa)}
              onChange={setResultado}
              options={RESULTADOS.map((r) => ({ value: r, label: ROTULO_DO_RESULTADO[r] }))}
              className="self-start"
            />
          </div>
          <Field label="Nota (opcional, vai para cada negócio/contato)">
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={2} />
          </Field>
          <label htmlFor={idSem} className="flex items-center gap-2 text-small text-text-primary">
            <Checkbox id={idSem} checked={semProximo} onCheckedChange={(v) => setSemProximo(v === true)} />
            Sem próximo passo para estas tarefas
          </label>
        </div>
      </ModalContent>
    </Modal>
  );
}
