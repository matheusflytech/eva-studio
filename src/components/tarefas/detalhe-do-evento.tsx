"use client";

import * as React from "react";
import { AlarmClock, CalendarDays, Check, Clock, RotateCcw, SquareArrowOutUpRight } from "lucide-react";
import Link from "@/components/contrato/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import { cn } from "@/lib/utils";
import { diaEmSP } from "@/lib/tarefas/calendario";
import type { TarefaDaTela } from "@/lib/tarefas/tela";
import { valorCurto } from "@/components/crm/negocios/modelo";
import { horaDoEvento, tituloDoDia, type EventoDoCalendario } from "./calendario-dados";
import { antecedencia, minutosDeDuracao } from "./calendario-semana";
import { corDoEvento } from "./semana";

const primeiraMaiuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function duracao(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

/**
 * Detalhe do item escolhido no Calendário (coluna da esquerda): quando, há
 * quanto tempo falta, a que negócio e contato está ligado e as ações de
 * sempre (concluir, reabrir, abrir a ficha). Fechamento previsto mostra o
 * valor e a etapa e leva à ficha do negócio.
 */
export function DetalheDoEvento({
  evento: e,
  agora,
  onConcluir,
  onReabrir,
}: {
  evento: EventoDoCalendario | null;
  agora: Date;
  onConcluir: (t: TarefaDaTela, el?: HTMLElement) => void;
  onReabrir: (t: TarefaDaTela) => void;
}) {
  if (!e) return <p className="py-2 text-small text-text-tertiary">Nada marcado para este dia.</p>;

  const quando = antecedencia(e, agora);
  const min = minutosDeDuracao(e);
  const t = e.tarefa;
  const negocio = e.negocio ? { id: e.negocio.id, nome: e.titulo } : t?.deal ? { id: t.deal.id, nome: t.deal.name } : null;
  const cor = CATEGORY_CLASSES[corDoEvento(e)];

  const linhas: { rotulo: string; valor: React.ReactNode }[] = [];
  if (e.negocio) {
    linhas.push({ rotulo: "Valor", valor: valorCurto(e.negocio.valorCents) });
    linhas.push({ rotulo: "Etapa", valor: e.negocio.funil ? `${e.negocio.etapa} · ${e.negocio.funil}` : e.negocio.etapa });
    if (e.negocio.empresa) linhas.push({ rotulo: "Empresa", valor: e.negocio.empresa });
  }
  if (t) {
    if (t.deal) linhas.push({ rotulo: "Negócio", valor: <Link href={`/deals/${t.deal.id}`} className="font-medium text-accent-fg hover:underline">{t.deal.name}</Link> });
    if (t.contact) linhas.push({ rotulo: "Contato", valor: <Link href={`/contacts/${t.contact.id}`} className="font-medium text-accent-fg hover:underline">{t.contact.name}</Link> });
    if (t.assignedTo) linhas.push({ rotulo: "Responsável", valor: t.assignedTo.name });
  }

  return (
    <article aria-label={`Detalhe: ${e.titulo}`} className="flex flex-col gap-4">
      <header className="flex items-start gap-2">
        <span aria-hidden="true" className={cn("mt-1.5 size-2 shrink-0 rounded-full", cor.solid)} />
        <h3 className="min-w-0 flex-1 text-body font-semibold leading-snug text-text-primary">{e.titulo}</h3>
        {quando && (
          <span
            className={cn(
              "inline-flex shrink-0 items-center gap-1 text-caption font-medium",
              quando.tom === "perigo" ? "text-danger" : quando.tom === "aviso" ? "text-warning" : "text-text-tertiary"
            )}
          >
            <AlarmClock size={13} aria-hidden="true" /> {quando.texto}
          </span>
        )}
      </header>

      <dl className="flex flex-col gap-1.5 text-small text-text-secondary">
        <div className="flex items-center gap-2">
          <CalendarDays size={14} aria-hidden="true" className="shrink-0 text-text-tertiary" />
          <dt className="sr-only">Dia</dt>
          <dd>{primeiraMaiuscula(tituloDoDia(diaEmSP(e.inicio)))}</dd>
        </div>
        <div className="flex items-center gap-2">
          <Clock size={14} aria-hidden="true" className="shrink-0 text-text-tertiary" />
          <dt className="sr-only">Horário</dt>
          <dd>
            {e.origem === "negocio"
              ? "Previsão de fechamento"
              : e.diaTodo
                ? "Dia todo"
                : `${min ? `${duracao(min)} ` : ""}(${horaDoEvento(e)}${e.fim ? ` – ${horaDoEvento({ ...e, inicio: e.fim })}` : ""})`}
          </dd>
        </div>
      </dl>

      {(linhas.length > 0 || t) && (
        <section aria-label="Sobre" className="flex flex-col gap-2">
          <p className="text-small font-semibold text-text-primary">{e.origem === "negocio" ? "Sobre o negócio" : "Sobre esta tarefa"}</p>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-small">
            {linhas.map((l) => (
              <React.Fragment key={l.rotulo}>
                <dt className="text-text-tertiary">{l.rotulo}</dt>
                <dd className="truncate text-text-primary">{l.valor}</dd>
              </React.Fragment>
            ))}
          </dl>
        </section>
      )}

      <div className="flex flex-wrap gap-2 border-t border-border-subtle pt-3">
        {t && !t.doneAt && (
          <Button size="sm" onClick={(ev) => onConcluir(t, ev.currentTarget)}>
            <Check size={14} aria-hidden="true" /> Concluir
          </Button>
        )}
        {t?.doneAt && (
          <Button size="sm" variant="secondary" onClick={() => onReabrir(t)}>
            <RotateCcw size={14} aria-hidden="true" /> Reabrir
          </Button>
        )}
        {negocio && (
          <Link href={`/deals/${negocio.id}`} className={buttonVariants({ variant: "secondary", size: "sm" })}>
            <SquareArrowOutUpRight size={14} aria-hidden="true" /> Abrir negócio
          </Link>
        )}
      </div>
    </article>
  );
}
