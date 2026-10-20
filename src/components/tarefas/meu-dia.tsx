"use client";

import * as React from "react";
import { CalendarClock, CircleCheck, ListOrdered, MessagesSquare, Play, Sunrise, UserPlus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { IconButton } from "@/components/ui/icon-button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { textoDeMinutos, textoDoPrazo } from "@/lib/tarefas/formato";
import type { FonteDoItem } from "@/lib/tarefas/meu-dia";
import type { ItemDoDiaDaTela, MeuDiaDaTela } from "@/lib/tarefas/tela";
import { AcaoRapida, IconeDoTipo, RotuloDaOrigem } from "./pecas";
import { MenuDeAdiar, pedirAdiamento } from "./adiar";
import { useConcluirTarefa } from "./concluir";
import { FilaDeTrabalho } from "./fila";

// "Meu dia" — a home do vendedor (skill crm-tasks-agenda, §6): compromissos
// com hora no topo, o resto ranqueado pelo score, a capacidade do dia (o que
// passa vira "provavelmente amanhã", com adiar em 1 clique) e as filas por
// tipo para trabalhar registro a registro.

const FONTE: Record<Exclude<FonteDoItem, "tarefa">, { rotulo: string; icone: LucideIcon }> = {
  responder: { rotulo: "Responder", icone: MessagesSquare },
  primeiro_contato: { rotulo: "Lead novo", icone: UserPlus },
  proximo_passo: { rotulo: "Sem próximo passo", icone: CalendarClock },
};

async function buscarDia(): Promise<{ ok: true; dia: MeuDiaDaTela } | { ok: false; erro: string }> {
  try {
    const res = await fetch("/api/tasks/meu-dia");
    const dados = await res.json().catch(() => ({}));
    return res.ok ? { ok: true, dia: dados } : { ok: false, erro: dados.error ?? "Não foi possível montar o seu dia." };
  } catch {
    return { ok: false, erro: "Sem conexão." };
  }
}

export function MeuDia({ versao, onMudou }: { versao: number; onMudou: () => void }) {
  const toast = useToast();
  const [dia, setDia] = React.useState<MeuDiaDaTela | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [fila, setFila] = React.useState<{ titulo: string; itens: ItemDoDiaDaTela[] } | null>(null);
  const [agora, setAgora] = React.useState(() => new Date());

  const aplicar = React.useCallback((r: { ok: true; dia: MeuDiaDaTela } | { ok: false; erro: string }) => {
    if (!r.ok) {
      setErro(r.erro);
      return;
    }
    setErro(null);
    setDia(r.dia);
    setAgora(new Date());
  }, []);

  const carregar = React.useCallback(() => buscarDia().then(aplicar), [aplicar]);

  React.useEffect(() => {
    let vivo = true;
    buscarDia().then((r) => vivo && aplicar(r));
    return () => {
      vivo = false;
    };
  }, [aplicar, versao]);

  const mudou = React.useCallback(() => {
    carregar();
    onMudou();
  }, [carregar, onMudou]);

  const { abrir, dialogo } = useConcluirTarefa(() => mudou());

  const todos = React.useMemo(() => (dia ? [...dia.fixos, ...dia.agora, ...dia.provavelmenteAmanha] : []), [dia]);

  function abrirFila(titulo: string, ids: string[]) {
    const porId = new Map(todos.map((i) => [i.id, i]));
    const itens = ids.map((id) => porId.get(id)).filter((i): i is ItemDoDiaDaTela => !!i);
    if (itens.length) setFila({ titulo, itens });
  }

  async function adiarExcedente() {
    if (!dia) return;
    const tarefas = dia.provavelmenteAmanha.filter((i) => i.tarefa);
    let ok = 0;
    for (const i of tarefas) if ((await pedirAdiamento(i.tarefa!.id, { opcao: "amanha" })).ok) ok++;
    toast({ title: `${ok} ${ok === 1 ? "tarefa foi" : "tarefas foram"} para amanhã 9h`, tone: "success" });
    mudou();
  }

  if (fila) {
    return (
      <FilaDeTrabalho
        titulo={fila.titulo}
        itens={fila.itens}
        onMudou={onMudou}
        onSair={() => {
          setFila(null);
          carregar();
        }}
      />
    );
  }

  if (erro) return <p role="alert" className="text-small text-danger">{erro}</p>;
  if (!dia) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-6 w-2/3" />
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-11" />
        ))}
      </div>
    );
  }

  const vazio = todos.length === 0;
  const ordemDeTrabalho = [...dia.agora, ...dia.provavelmenteAmanha].map((i) => i.id);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-body text-text-secondary">{dia.resumo.texto}</p>
        {!vazio && (
          <p className="text-small text-text-secondary tabular-nums" title="Minutos até o fim do expediente (18h), menos compromissos e 15% de folga">
            Cabe hoje: <span className="font-medium text-text-primary">{textoDeMinutos(dia.capacidade.livres)}</span> · planejado{" "}
            <span className="font-medium text-text-primary">{textoDeMinutos(dia.capacidade.planejados)}</span>
            {dia.capacidade.excedentes > 0 && <span className="text-warning"> · passa {textoDeMinutos(dia.capacidade.excedentes)}</span>}
          </p>
        )}
      </div>

      {vazio ? (
        <EmptyState icon={<CircleCheck />} title="Nada para hoje" description="Sem tarefas vencendo, clientes esperando ou negócios sem próximo passo." />
      ) : (
        <>
          {dia.filas.length > 0 && (
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filas por tipo">
              <Button variant="primary" size="sm" onClick={() => abrirFila("Fila do dia", ordemDeTrabalho)} disabled={ordemDeTrabalho.length === 0}>
                <Play size={14} aria-hidden /> Começar pela ordem
              </Button>
              {dia.filas.map((f) => (
                <Button key={f.tipo} variant="secondary" size="sm" onClick={() => abrirFila(f.rotulo, f.ids)}>
                  <IconeDoTipo tipo={f.tipo} className="size-3.5" /> {f.rotulo}
                </Button>
              ))}
            </div>
          )}

          {dia.fixos.length > 0 && (
            <Panel title="Compromissos com hora" flush>
              <ul>
                {dia.fixos.map((i) => (
                  <ItemDoDia key={i.id} item={i} agora={agora} onConcluir={abrir} onMudou={mudou} />
                ))}
              </ul>
            </Panel>
          )}

          <Panel
            title={
              <span className="inline-flex items-center gap-2">
                <ListOrdered size={16} aria-hidden className="text-text-tertiary" /> Para hoje, nesta ordem
              </span>
            }
            flush
          >
            {dia.agora.length === 0 ? (
              <p className="px-4 py-6 text-body text-text-secondary">Nada além dos compromissos.</p>
            ) : (
              <ol>
                {dia.agora.map((i) => (
                  <ItemDoDia key={i.id} item={i} agora={agora} onConcluir={abrir} onMudou={mudou} />
                ))}
              </ol>
            )}
          </Panel>

          {dia.provavelmenteAmanha.length > 0 && (
            <Panel
              title={
                <span className="inline-flex items-center gap-2">
                  <Sunrise size={16} aria-hidden className="text-text-tertiary" /> Provavelmente amanhã
                </span>
              }
              actions={
                dia.provavelmenteAmanha.some((i) => i.tarefa) ? (
                  <Button size="sm" variant="secondary" onClick={adiarExcedente}>
                    Adiar para amanhã 9h
                  </Button>
                ) : null
              }
              flush
            >
              <p className="border-b border-border-subtle px-4 py-2 text-small text-text-secondary">
                Não cabe no que sobra do seu dia. Adie agora e comece amanhã com a lista certa.
              </p>
              <ul>
                {dia.provavelmenteAmanha.map((i) => (
                  <ItemDoDia key={i.id} item={i} agora={agora} onConcluir={abrir} onMudou={mudou} />
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
      {dialogo}
    </div>
  );
}

function ItemDoDia({
  item,
  agora,
  onConcluir,
  onMudou,
}: {
  item: ItemDoDiaDaTela;
  agora: Date;
  onConcluir: (t: NonNullable<ItemDoDiaDaTela["tarefa"]>) => void;
  onMudou: () => void;
}) {
  const t = item.tarefa;
  const fonte = item.fonte !== "tarefa" ? FONTE[item.fonte] : null;
  const contato = item.contexto.contato
    ? { telefone: item.contexto.contato.telefone, email: item.contexto.contato.email, conversaId: item.contexto.conversaId }
    : null;
  const atrasada = !!t?.overdue;
  return (
    <li className="flex min-h-11 items-start gap-3 border-b border-border-subtle px-3 py-2 last:border-b-0">
      {t ? (
        <IconButton aria-label={`Concluir: ${t.text}`} tooltip="Concluir" size="sm" onClick={() => onConcluir(t)}>
          <CircleCheck />
        </IconButton>
      ) : (
        <span className="flex size-7 items-center justify-center" aria-hidden>
          {fonte && <fonte.icone size={16} className="text-text-tertiary" />}
        </span>
      )}
      <IconeDoTipo tipo={item.tipo} className="mt-1.5" />
      <div className="min-w-0 flex-1">
        <p className="text-body text-text-primary">{item.titulo}</p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-tertiary">
          {fonte && <Badge variant={item.fonte === "responder" ? "info" : "neutral"}>{fonte.rotulo}</Badge>}
          {item.contexto.negocio && <span className="truncate">{item.contexto.negocio.nome}</span>}
          {!item.contexto.negocio && item.contexto.contato && <span className="truncate">{item.contexto.contato.nome}</span>}
          {item.prioridade === "alta" && <Badge variant="warning">Alta</Badge>}
          {t && <RotuloDaOrigem origem={t.origem} />}
          <span className="tabular-nums">{textoDeMinutos(item.duracaoMin)}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        {(item.dueAt || item.fonte === "responder") && (
          <span className={cn("text-small tabular-nums", atrasada ? "font-medium text-danger" : "text-text-secondary")}>
            {item.dueAt ? textoDoPrazo(item.dueAt, item.diaTodo, agora) : "esperando"}
            {atrasada && <span className="sr-only"> (atrasada)</span>}
          </span>
        )}
        <AcaoRapida tipo={item.tipo} contato={contato} />
        {t && <MenuDeAdiar tarefa={{ id: t.id, dueAt: t.dueAt, deal: t.deal }} onAdiada={onMudou} />}
      </div>
    </li>
  );
}
