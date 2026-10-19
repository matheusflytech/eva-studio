"use client";

import * as React from "react";
import Link from "next/link";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Hourglass,
  ListTodo,
  Mail,
  MessageCircle,
  Phone,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ChipsDeCampos } from "@/components/crm/campos-personalizados";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { dinheiro, iniciais, pedeAtencao, sinalDoNegocio, type IconeDoSinal, type NegocioKanban } from "./modelo";

// Tons apagados para avatares: identificam sem gritar (cor viva aleatória é o
// que deixa kanban com cara de brinquedo). A cor sai do nome, então a mesma
// pessoa tem sempre a mesma cor.
const TONS = ["#2b3550", "#3a2f45", "#2d3f3a", "#45372a", "#353a40", "#2a3d47"];
function tomDoNome(nome: string): string {
  let h = 0;
  for (const c of nome) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return TONS[h % TONS.length];
}

export function Avatar({ nome, tamanho = 22, rotulo }: { nome: string; tamanho?: number; rotulo?: string }) {
  return (
    <span
      title={rotulo ?? nome}
      aria-label={rotulo ?? nome}
      className="inline-grid shrink-0 place-items-center rounded-full font-semibold text-text-primary"
      style={{ width: tamanho, height: tamanho, fontSize: Math.round(tamanho * 0.42), background: tomDoNome(nome) }}
    >
      {iniciais(nome)}
    </span>
  );
}

const ICONE: Record<IconeDoSinal, LucideIcon> = {
  clock: Clock,
  cal: CalendarDays,
  hour: Hourglass,
  phone: Phone,
  mail: Mail,
  task: ListTodo,
  check: CheckCircle2,
};

const TOM = {
  bad: "bg-danger/12 text-danger",
  warn: "bg-amber-400/12 text-amber-300",
  ok: "bg-emerald-400/12 text-emerald-400",
  neu: "bg-surface-3 text-text-secondary",
} as const;

/**
 * Cartão do negócio (direção híbrida): quem é, o que é, quanto vale e quão
 * perto está, e um único sinal do próximo passo. WhatsApp com ponto quando o
 * cliente falou e ninguém leu.
 */
export function DealCard({
  deal,
  tipoDaEtapa,
  defs,
  agora,
  arrastando,
}: {
  deal: NegocioKanban;
  tipoDaEtapa: string;
  defs: DefinicaoDeCampo[];
  agora: Date;
  arrastando?: boolean;
}) {
  const contato = deal.contacts[0]?.name || "";
  const titulo = deal.company?.name || contato || deal.name;
  const subtitulo = titulo === deal.name ? (contato && contato !== titulo ? contato : "") : deal.name;
  const sinal = sinalDoNegocio(deal, tipoDaEtapa, agora);
  const atencao = pedeAtencao(deal, tipoDaEtapa, agora);
  const aberto = tipoDaEtapa === "open";
  const Icone = sinal ? ICONE[sinal.icone] : null;

  return (
    <div
      className={cn(
        "relative rounded-[10px] border bg-surface-2 px-3 py-[11px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[background-color,border-color,transform] duration-150",
        "group-hover/card:border-border-default group-hover/card:bg-surface-3 motion-reduce:transition-none",
        atencao ? "border-amber-400/35" : "border-border-subtle",
        arrastando && "rotate-[1.5deg] border-border-strong bg-surface-3 shadow-[0_12px_32px_rgba(0,0,0,0.5)]",
        tipoDaEtapa === "lost" && "opacity-65"
      )}
    >
      <div className="flex items-center gap-2">
        <Avatar nome={titulo} />
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-text-primary">{titulo}</span>
        {deal.whatsapp && (
          <span
            className="relative inline-flex text-[#25d366] transition-opacity group-hover/card:opacity-0"
            title={deal.whatsapp.naoLida ? "Mensagem não lida no WhatsApp" : "Tem conversa no WhatsApp"}
          >
            <MessageCircle size={15} aria-hidden />
            {deal.whatsapp.naoLida && (
              <span className="absolute -right-0.5 -top-0.5 h-[7px] w-[7px] rounded-full border-2 border-surface-2 bg-[#25d366]" />
            )}
          </span>
        )}
        {tipoDaEtapa === "lost" && <XCircle size={14} aria-label="Perdido" className="text-rose-400" />}
      </div>

      {subtitulo && <p className="mt-1 truncate text-[12px] text-text-secondary">{subtitulo}</p>}

      <div className="mt-[9px] flex items-center gap-2">
        <span className="font-display text-[14px] font-semibold tabular-nums text-text-primary">
          {deal.amountCents > 0 ? dinheiro(deal.amountCents) : <span className="font-sans text-[12px] font-normal text-text-tertiary">Sem valor</span>}
        </span>
        {aberto && (
          <>
            <span className="h-[3px] w-[34px] overflow-hidden rounded-full bg-surface-3" aria-hidden>
              <span className="block h-full rounded-full bg-accent-500" style={{ width: `${deal.probability}%` }} />
            </span>
            <span className="text-[11px] tabular-nums text-text-tertiary" title="Chance de fechar">
              {deal.probability}%
            </span>
          </>
        )}
        {deal.owner && (
          <span className="ml-auto">
            <Avatar nome={deal.owner.name || "Sem nome"} tamanho={18} rotulo={`Responsável: ${deal.owner.name || "sem nome"}`} />
          </span>
        )}
      </div>

      <ChipsDeCampos defs={defs} valores={deal.customFields} />

      {sinal && Icone && (
        <div className="mt-[9px] flex items-center gap-1.5 text-[11.5px]">
          <span className={cn("inline-flex min-w-0 items-center gap-1 rounded-md px-[7px] py-0.5", TOM[sinal.tom])}>
            <Icone size={12} aria-hidden className="shrink-0" />
            <span className="truncate">{sinal.texto}</span>
          </span>
          {deal.openTasks > 1 && (
            <span className="text-[11px] tabular-nums text-text-tertiary" title={`${deal.openTasks} tarefas abertas`}>
              +{deal.openTasks - 1}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Ações rápidas que aparecem ao passar o mouse (sem ocupar espaço em repouso). */
export function AcoesRapidas({ deal, onAbrir }: { deal: NegocioKanban; onAbrir: () => void }) {
  return (
    <div className="pointer-events-none absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity duration-150 group-hover/card:pointer-events-auto group-hover/card:opacity-100 group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100">
      {deal.whatsapp && (
        <Link
          href={`/conversas?c=${deal.whatsapp.conversationId}`}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
          aria-label="Abrir conversa no WhatsApp"
          title="Abrir conversa"
          className="grid h-6 w-6 place-items-center rounded-md border border-border-default bg-bg-base text-[#25d366] outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent-500/60"
        >
          <MessageCircle size={13} aria-hidden />
        </Link>
      )}
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onAbrir();
        }}
        aria-label="Ver tarefas e detalhes"
        title="Tarefas e detalhes"
        className="grid h-6 w-6 place-items-center rounded-md border border-border-default bg-bg-base text-text-secondary outline-none hover:border-border-strong hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60"
      >
        <ListTodo size={13} aria-hidden />
      </button>
    </div>
  );
}
