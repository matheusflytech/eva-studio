"use client";

import * as React from "react";
import { HandCoins } from "lucide-react";
import { focusRing } from "@/components/ui/styles";
import { CATEGORY_CLASSES } from "@/lib/design-system/category-classes";
import type { CategoryColor } from "@/lib/design-system/tokens";
import { cn } from "@/lib/utils";
import { mesmoDia, minutoDoDia, type Dia } from "@/lib/tarefas/calendario";
import type { TipoDeTarefa } from "@/lib/tarefas/tipos";
import { chaveDoDia, horaDoEvento, tituloDoDia, type EventoDoCalendario } from "./calendario-dados";
import { blocosDoDia } from "./calendario-semana";
import { IconeDoTipo } from "./pecas";

// Grade da semana (visão padrão do Calendário): segunda a domingo, uma linha
// por hora, cada evento num cartão na altura do horário. Dia todo (e os
// fechamentos previstos) vai na faixa de cima. Linha do "agora" atravessa a
// semana quando hoje está nela.

/** Altura de uma hora na grade. */
const HORA_PX = 64;
const DIA_SEMANA = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"] as const;
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"] as const;

/** Cor de dado de cada tipo de tarefa; fechamento previsto é verde. */
const COR_DO_TIPO: Record<TipoDeTarefa, CategoryColor> = {
  ligar: "blue",
  whatsapp: "teal",
  email: "orange",
  reuniao: "violet",
  visita: "amber",
  afazer: "slate",
};

export function corDoEvento(e: EventoDoCalendario): CategoryColor {
  if (e.cor) return e.cor;
  if (e.origem === "negocio") return "green";
  if (e.atrasada) return "red";
  return e.tipo ? COR_DO_TIPO[e.tipo] : "blue";
}

const dois = (n: number) => String(n).padStart(2, "0");

export function GradeDaSemana({
  dias,
  porDia,
  hoje,
  agora,
  escolhido,
  selecionadoId,
  onEscolherDia,
  onEscolherEvento,
}: {
  dias: Dia[];
  porDia: Map<string, EventoDoCalendario[]>;
  hoje: Dia;
  agora: Date;
  escolhido: Dia;
  selecionadoId: string | null;
  onEscolherDia: (d: Dia) => void;
  onEscolherEvento: (e: EventoDoCalendario) => void;
}) {
  const rolagem = React.useRef<HTMLDivElement>(null);
  const temHoje = dias.some((d) => mesmoDia(d, hoje));
  const minutoAgora = minutoDoDia(agora);
  const diaTodo = dias.map((d) => (porDia.get(chaveDoDia(d)) ?? []).filter((e) => e.diaTodo));
  const temDiaTodo = diaTodo.some((l) => l.length > 0);
  const chaveDaSemana = chaveDoDia(dias[0]);

  // Ao abrir (e a cada semana nova): rola até uma hora antes do primeiro
  // compromisso, ou do "agora" quando hoje está na semana; padrão 7h.
  React.useEffect(() => {
    const el = rolagem.current;
    if (!el) return;
    const comHora = dias.flatMap((d) => (porDia.get(chaveDoDia(d)) ?? []).filter((e) => !e.diaTodo).map((e) => minutoDoDia(e.inicio)));
    const alvo = temHoje ? minutoAgora : comHora.length ? Math.min(...comHora) : 7 * 60;
    el.scrollTop = Math.max(0, ((alvo - 60) / 60) * HORA_PX);
    // Só ao trocar de semana: recarregar os dados não mexe na rolagem.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveDaSemana]);

  return (
    <div className="flex min-w-0 flex-col">
      {/* Cabeçalho: dia da semana e data; o dia escolhido fica em destaque. */}
      <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-border-subtle">
        <span aria-hidden="true" />
        {dias.map((d, i) => {
          const ehHoje = mesmoDia(d, hoje);
          const ehEscolhido = mesmoDia(d, escolhido);
          return (
            <button
              key={chaveDoDia(d)}
              type="button"
              onClick={() => onEscolherDia(d)}
              aria-pressed={ehEscolhido}
              aria-label={`${tituloDoDia(d)}${ehHoje ? " (hoje)" : ""}`}
              className={cn(
                "flex flex-col items-center gap-0.5 border-l border-border-subtle py-2 transition-colors duration-150",
                ehEscolhido ? "bg-raised" : "hover:bg-raised/60",
                focusRing
              )}
            >
              <span className={cn("text-caption", ehEscolhido || ehHoje ? "font-semibold text-text-primary" : "text-text-secondary")}>
                {DIA_SEMANA[i]}
              </span>
              <span className={cn("font-mono text-caption tabular-nums", ehHoje ? "text-accent-fg" : "text-text-tertiary")}>
                {d.dia} {MESES_CURTOS[d.mes - 1]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Dia todo: tarefas sem hora e fechamentos previstos. */}
      {temDiaTodo && (
        <div className="grid grid-cols-[56px_repeat(7,minmax(0,1fr))] border-b border-border-subtle">
          <span className="self-center pr-2 text-right font-mono text-caption text-text-tertiary">dia</span>
          {diaTodo.map((lista, i) => (
            <div key={i} className={cn("flex min-w-0 flex-col gap-1 border-l border-border-subtle p-1", mesmoDia(dias[i], escolhido) && "bg-raised")}>
              {lista.map((e) => (
                <CartaoDoEvento key={e.id} evento={e} selecionado={e.id === selecionadoId} onEscolher={onEscolherEvento} compacto />
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Horas. */}
      <div ref={rolagem} className="relative max-h-[600px] overflow-y-auto">
        <div className="relative grid grid-cols-[56px_repeat(7,minmax(0,1fr))]" style={{ height: 24 * HORA_PX }}>
          {/* Régua das horas. */}
          <div className="relative" aria-hidden="true">
            {Array.from({ length: 23 }, (_, h) => (
              <span key={h} className="absolute right-2 -translate-y-1/2 font-mono text-caption tabular-nums text-text-tertiary" style={{ top: (h + 1) * HORA_PX }}>
                {dois(h + 1)}:00
              </span>
            ))}
          </div>

          {dias.map((d) => {
            const blocos = blocosDoDia(porDia.get(chaveDoDia(d)) ?? []);
            return (
              <div
                key={chaveDoDia(d)}
                className={cn("relative border-l border-border-subtle", mesmoDia(d, escolhido) && "bg-raised/70")}
                style={{
                  backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${HORA_PX - 1}px, var(--border-subtle) ${HORA_PX - 1}px, var(--border-subtle) ${HORA_PX}px)`,
                }}
              >
                {blocos.map((b) => (
                  <div
                    key={b.evento.id}
                    className="absolute px-0.5"
                    style={{
                      top: (b.inicioMin / 60) * HORA_PX + 1,
                      height: ((b.fimMin - b.inicioMin) / 60) * HORA_PX - 2,
                      left: `${(b.coluna / b.colunas) * 100}%`,
                      width: `${100 / b.colunas}%`,
                    }}
                  >
                    <CartaoDoEvento evento={b.evento} selecionado={b.evento.id === selecionadoId} onEscolher={onEscolherEvento} />
                  </div>
                ))}
              </div>
            );
          })}

          {/* Agora: linha pela semana toda, com a hora na régua. */}
          {temHoje && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: (minutoAgora / 60) * HORA_PX }}>
              <span className="w-[56px] -translate-y-0 pr-1 text-right">
                <span className="rounded-md bg-inverse px-1.5 py-0.5 font-mono text-caption tabular-nums text-inverse-fg">{horaDoEvento({ inicio: agora } as EventoDoCalendario)}</span>
              </span>
              <span className="h-px flex-1 bg-inverse" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CartaoDoEvento({
  evento: e,
  selecionado,
  onEscolher,
  compacto = false,
}: {
  evento: EventoDoCalendario;
  selecionado: boolean;
  onEscolher: (e: EventoDoCalendario) => void;
  compacto?: boolean;
}) {
  const cor = CATEGORY_CLASSES[corDoEvento(e)];
  const sub = e.negocio
    ? [e.negocio.etapa, e.negocio.empresa].filter(Boolean).join(" · ")
    : [e.tarefa?.deal?.name, e.tarefa?.contact?.name].filter(Boolean).join(" · ");
  const hora = e.diaTodo ? null : `${horaDoEvento(e)}${e.fim ? ` – ${horaDoEvento({ ...e, inicio: e.fim })}` : ""}`;
  return (
    <button
      type="button"
      onClick={() => onEscolher(e)}
      aria-pressed={selecionado}
      aria-label={`${e.titulo}${hora ? `, ${hora}` : ""}${e.atrasada ? ", atrasada" : ""}${e.feita ? ", feita" : ""}`}
      className={cn(
        "relative flex h-full w-full min-w-0 flex-col overflow-hidden rounded-[10px] border border-border-subtle bg-panel py-1 pl-2.5 pr-1.5 text-left shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[box-shadow,transform] duration-150 hover:-translate-y-px hover:shadow-overlay",
        selecionado && "ring-2 ring-text-primary",
        e.feita && "opacity-55",
        focusRing
      )}
    >
      <span aria-hidden="true" className={cn("absolute inset-y-1 left-1 w-[3px] rounded-full", cor.solid)} />
      <span className={cn("absolute inset-0 -z-0 opacity-40", cor.subtle)} aria-hidden="true" />
      <span className="relative flex min-w-0 items-start gap-1">
        <span className={cn("line-clamp-2 min-w-0 flex-1 text-caption font-semibold leading-tight", e.feita ? "text-text-tertiary line-through" : "text-text-primary")}>{e.titulo}</span>
        {e.tipo ? <IconeDoTipo tipo={e.tipo} className="mt-px size-3" /> : e.origem === "negocio" && <HandCoins aria-hidden="true" className="mt-px size-3 shrink-0 text-text-tertiary" />}
      </span>
      {!compacto && hora && <span className={cn("relative font-mono text-[11px] tabular-nums leading-tight", cor.fg)}>{hora}</span>}
      {!compacto && sub && <span className="relative truncate text-[11px] leading-tight text-text-tertiary">{sub}</span>}
    </button>
  );
}

