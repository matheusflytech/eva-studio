"use client";

import * as React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { focusRing } from "@/components/ui/styles";
import { textoDeMinutos } from "@/lib/tarefas/formato";
import { partesEmSP } from "@/lib/fuso-sp";
import type { ItemDoDiaDaTela, MeuDiaDaTela } from "@/lib/tarefas/tela";
import { BlocoDeHorario, IconeDoTipo, TituloDeGrupo } from "./pecas";

// Coluna da direita do desktop largo (Meu dia e Todas as tarefas): só o que a
// rota do Meu dia já entrega — a capacidade do dia, as filas por tipo (abrem a
// fila de trabalho) e os próximos compromissos com hora.

/** Quantos compromissos aparecem na coluna. */
const COMPROMISSOS = 5;

const dois = (n: number) => String(n).padStart(2, "0");

function hora(iso: string): string {
  const p = partesEmSP(new Date(iso));
  return `${dois(p.hora)}:${dois(p.minuto)}`;
}

/** Itens do Meu dia na ordem dos ids pedidos (para abrir uma fila). */
export function itensDaFila(dia: MeuDiaDaTela, ids: string[]): ItemDoDiaDaTela[] {
  const porId = new Map([...dia.fixos, ...dia.agora, ...dia.provavelmenteAmanha].map((i) => [i.id, i]));
  return ids.map((id) => porId.get(id)).filter((i): i is ItemDoDiaDaTela => !!i);
}

/** O Meu dia para quem não é a aba Meu dia (Todas as tarefas): mesma rota, recarrega com a versão. */
export function useMeuDia(versao: number): MeuDiaDaTela | null {
  const [dia, setDia] = React.useState<MeuDiaDaTela | null>(null);
  React.useEffect(() => {
    let vivo = true;
    fetch("/api/tasks/meu-dia")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: MeuDiaDaTela | null) => {
        if (vivo && d) setDia(d);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [versao]);
  return dia;
}

export function ColunaDoDia({
  dia,
  agora,
  onAbrirFila,
}: {
  dia: MeuDiaDaTela;
  agora: Date;
  onAbrirFila: (titulo: string, ids: string[]) => void;
}) {
  const { livres, planejados, excedentes, fixosMin } = dia.capacidade;
  const passou = excedentes > 0;
  const uso = livres > 0 ? Math.min(1, planejados / livres) : planejados > 0 ? 1 : 0;
  const proximos = dia.fixos.filter((i) => i.dueAt && (new Date(i.dueAt).getTime() >= agora.getTime() || i.tarefa?.overdue)).slice(0, COMPROMISSOS);

  return (
    <div className="flex flex-col gap-6">
      <section aria-labelledby="coluna-capacidade" className="rounded-[18px] border border-border-subtle bg-panel px-5 py-4">
        <h2 id="coluna-capacidade" className="font-mono text-caption text-text-tertiary">
          Capacidade de hoje
        </h2>
        <p className={cn("mt-2 text-title font-light tracking-tight tabular-nums", passou ? "text-warning" : "text-text-primary")}>
          {passou ? `passa ${textoDeMinutos(excedentes)}` : `sobram ${textoDeMinutos(Math.max(0, livres - planejados))}`}
        </p>
        <p className="text-small text-text-secondary">{passou ? "do que cabe até as 18h" : "até as 18h"}</p>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-raised" aria-hidden="true">
          <div
            className={cn("h-full origin-left rounded-full transition-transform duration-500 ease-out", passou ? "bg-warning" : "bg-accent-solid")}
            style={{ transform: `scaleX(${uso})` }}
          />
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2 text-caption">
          {[
            ["Planejado", planejados],
            ["Cabe", livres],
            ["Compromissos", fixosMin],
          ].map(([rotulo, min]) => (
            <div key={rotulo as string} className="flex min-w-0 flex-col">
              <dt className="truncate text-text-tertiary">{rotulo}</dt>
              <dd className="font-mono tabular-nums text-text-primary">{textoDeMinutos(min as number)}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="coluna-filas">
        <TituloDeGrupo id="coluna-filas">Trabalhar em fila</TituloDeGrupo>
        {dia.filas.length === 0 ? (
          <p className="px-2 text-small text-text-tertiary">Nenhuma fila hoje.</p>
        ) : (
          <ul className="flex flex-col">
            {dia.filas.map((f) => (
              <li key={f.tipo}>
                <button
                  type="button"
                  onClick={() => onAbrirFila(f.rotulo, f.ids)}
                  className={cn(
                    "group/fila flex h-11 w-full items-center gap-3 rounded-xl px-2 text-left transition-colors duration-150 hover:bg-raised active:scale-[0.99] motion-safe:transition-[background-color,transform]",
                    focusRing
                  )}
                >
                  <IconeDoTipo tipo={f.tipo} />
                  <span className="min-w-0 flex-1 truncate text-body text-text-primary">{f.rotulo}</span>
                  <span className="font-mono text-caption tabular-nums text-text-tertiary">{f.ids.length}</span>
                  <ChevronRight size={14} aria-hidden="true" className="text-text-tertiary transition-transform duration-200 group-hover/fila:translate-x-0.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="coluna-compromissos">
        <TituloDeGrupo id="coluna-compromissos">Próximos compromissos</TituloDeGrupo>
        {proximos.length === 0 ? (
          <p className="px-2 text-small text-text-tertiary">Nada com hora marcada pelo resto do dia.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {proximos.map((i) => (
              <li key={i.id}>
                <BlocoDeHorario
                  hora={hora(i.dueAt!)}
                  titulo={i.titulo}
                  detalhe={i.contexto.negocio?.nome ?? i.contexto.contato?.nome ?? null}
                  tipo={i.tipo}
                  tom={i.tarefa?.overdue ? "atrasada" : "normal"}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
