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
// semana quando hoje está nela. Cabeçalho, faixa de dia todo e horas moram no
// mesmo container rolável: as colunas ficam alinhadas com ou sem barra de
// rolagem.

/** Altura de uma hora na grade. */
const HORA_PX = 80;
/** Largura da régua das horas. */
const REGUA = "64px";
const COLUNAS = `${REGUA} repeat(7, minmax(0, 1fr))`;
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

/** "17:44 – 17:59" (ou só o início quando não há fim). */
export function faixaDeHorario(e: EventoDoCalendario): string {
  return `${horaDoEvento(e)}${e.fim ? ` – ${horaDoEvento({ ...e, inicio: e.fim })}` : ""}`;
}

/** Linha de baixo do cartão: negócio e contato da tarefa, ou etapa e empresa do fechamento. */
export function linhaDeApoio(e: EventoDoCalendario): string {
  if (e.negocio) return [e.negocio.etapa, e.negocio.empresa].filter(Boolean).join(" · ");
  return [e.tarefa?.deal?.name, e.tarefa?.contact?.name].filter(Boolean).join(" · ");
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
    <div ref={rolagem} className="relative h-[max(520px,calc(100dvh-300px))] overflow-y-auto overflow-x-hidden overscroll-contain">
      {/* Cabeçalho e dia todo: grudam no topo enquanto as horas rolam. */}
      <div className="sticky top-0 z-20 bg-panel">
        <div className="grid border-b border-border-subtle" style={{ gridTemplateColumns: COLUNAS }}>
          <span aria-hidden="true" />
          {dias.map((d, i) => {
            const ehHoje = mesmoDia(d, hoje);
            const ehEscolhido = mesmoDia(d, escolhido);
            const quantos = (porDia.get(chaveDoDia(d)) ?? []).filter((e) => !e.feita).length;
            return (
              <button
                key={chaveDoDia(d)}
                type="button"
                onClick={() => onEscolherDia(d)}
                aria-pressed={ehEscolhido}
                aria-label={`${tituloDoDia(d)}${ehHoje ? " (hoje)" : ""}, ${quantos} em aberto`}
                className={cn(
                  "flex min-w-0 items-center justify-center gap-2 overflow-hidden border-l border-border-subtle px-2 py-2.5 transition-colors duration-150",
                  ehEscolhido ? "bg-raised" : "hover:bg-raised/60",
                  focusRing
                )}
              >
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full text-body font-semibold tabular-nums",
                    ehHoje ? "bg-accent-solid text-text-on-accent" : ehEscolhido ? "bg-inverse text-inverse-fg" : "text-text-primary"
                  )}
                >
                  {d.dia}
                </span>
                <span className="flex min-w-0 flex-col items-start leading-tight">
                  <span className={cn("truncate text-small", ehEscolhido || ehHoje ? "font-semibold text-text-primary" : "text-text-secondary")}>{DIA_SEMANA[i]}</span>
                  <span className="truncate font-mono text-caption tabular-nums text-text-tertiary">
                    {quantos ? `${quantos} em aberto` : MESES_CURTOS[d.mes - 1]}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {temDiaTodo && (
          <div className="grid border-b border-border-subtle" style={{ gridTemplateColumns: COLUNAS }}>
            <span className="self-center pr-3 text-right font-mono text-caption text-text-tertiary">dia todo</span>
            {diaTodo.map((lista, i) => (
              <div key={i} className={cn("flex min-w-0 flex-col gap-1 border-l border-border-subtle p-1.5", mesmoDia(dias[i], escolhido) && "bg-raised")}>
                {lista.map((e) => (
                  <CartaoDoEvento key={e.id} evento={e} selecionado={e.id === selecionadoId} onEscolher={onEscolherEvento} linhas={1} />
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Horas. */}
      <div className="relative grid" style={{ gridTemplateColumns: COLUNAS, height: 24 * HORA_PX }}>
        <div className="relative" aria-hidden="true">
          {Array.from({ length: 23 }, (_, h) => (
            <span key={h} className="absolute right-3 -translate-y-1/2 font-mono text-caption tabular-nums text-text-tertiary" style={{ top: (h + 1) * HORA_PX }}>
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
              {blocos.map((b) => {
                const altura = ((b.fimMin - b.inicioMin) / 60) * HORA_PX - 3;
                // Quantas linhas cabem: título, horário e a linha de apoio.
                const linhas = b.colunas >= 3 ? (altura >= 48 ? 2 : 1) : altura >= 70 ? 4 : altura >= 54 ? 3 : 2;
                return (
                  <div
                    key={b.evento.id}
                    className="absolute px-[3px]"
                    style={{
                      top: (b.inicioMin / 60) * HORA_PX + 1.5,
                      height: altura,
                      left: `${(b.coluna / b.colunas) * 100}%`,
                      width: `${100 / b.colunas}%`,
                    }}
                  >
                    <CartaoDoEvento evento={b.evento} selecionado={b.evento.id === selecionadoId} onEscolher={onEscolherEvento} linhas={linhas} />
                  </div>
                );
              })}
            </div>
          );
        })}

        {/* Agora: linha pela semana toda, com a hora na régua e um ponto no dia de hoje. */}
        {temHoje && (
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-10 grid items-center" style={{ top: (minutoAgora / 60) * HORA_PX, gridTemplateColumns: COLUNAS, transform: "translateY(-50%)" }}>
            <span className="pr-1.5 text-right">
              <span className="rounded-md bg-danger-solid px-1.5 py-0.5 font-mono text-caption font-semibold tabular-nums text-text-on-accent">{dois(Math.floor(minutoAgora / 60))}:{dois(minutoAgora % 60)}</span>
            </span>
            {dias.map((d) => (
              <span key={chaveDoDia(d)} className={cn("relative h-px", mesmoDia(d, hoje) ? "h-[2px] bg-danger-solid" : "bg-danger-solid/40")}>
                {mesmoDia(d, hoje) && <span className="absolute -left-1 -top-[3px] size-2 rounded-full bg-danger-solid" />}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Cartão de um item na grade. `linhas` diz quanto cabe: 1 = só o título;
 * 2 = título e horário; 3 = mais a linha de apoio; 4 = título em duas linhas.
 * Cada linha é uma só (sem quebra no meio): o que não cabe vira reticências.
 */
export function CartaoDoEvento({
  evento: e,
  selecionado,
  onEscolher,
  linhas,
  className,
}: {
  evento: EventoDoCalendario;
  selecionado: boolean;
  onEscolher: (e: EventoDoCalendario) => void;
  linhas: 1 | 2 | 3 | 4;
  className?: string;
}) {
  const cor = CATEGORY_CLASSES[corDoEvento(e)];
  const apoio = linhaDeApoio(e);
  const hora = e.diaTodo ? null : faixaDeHorario(e);
  return (
    <button
      type="button"
      onClick={() => onEscolher(e)}
      aria-pressed={selecionado}
      aria-label={`${e.titulo}${hora ? `, ${hora}` : ""}${e.atrasada ? ", atrasada" : ""}${e.feita ? ", feita" : ""}`}
      title={[e.titulo, hora, apoio].filter(Boolean).join("\n")}
      className={cn(
        "group/evento relative flex h-full w-full min-w-0 flex-col justify-start gap-px overflow-hidden rounded-[10px] border py-1 pl-3 pr-1.5 text-left",
        "transition-[box-shadow,transform,border-color] duration-150 hover:-translate-y-px hover:shadow-overlay",
        cor.subtle,
        selecionado ? "border-text-primary shadow-overlay" : "border-transparent",
        e.feita && "opacity-55",
        focusRing,
        className
      )}
    >
      <span aria-hidden="true" className={cn("absolute inset-y-1 left-1 w-[3px] rounded-full", cor.solid)} />
      <span className="flex min-w-0 items-center gap-1">
        <span
          className={cn(
            "min-w-0 flex-1 text-caption font-semibold leading-[1.25]",
            linhas >= 4 ? "line-clamp-2" : "truncate",
            e.feita ? "text-text-tertiary line-through" : "text-text-primary"
          )}
        >
          {e.titulo}
        </span>
        {e.tipo ? (
          <IconeDoTipo tipo={e.tipo} className="size-3 shrink-0" />
        ) : (
          e.origem === "negocio" && <HandCoins aria-hidden="true" className="size-3 shrink-0 text-text-tertiary" />
        )}
      </span>
      {linhas >= 2 && hora && <span className={cn("truncate whitespace-nowrap font-mono text-caption leading-[1.25] tabular-nums", cor.fg)}>{hora}</span>}
      {linhas >= 2 && !hora && e.negocio && apoio && <span className="truncate text-caption leading-[1.25] text-text-secondary">{apoio}</span>}
      {linhas >= 3 && hora && apoio && <span className="truncate text-caption leading-[1.25] text-text-secondary">{apoio}</span>}
    </button>
  );
}
