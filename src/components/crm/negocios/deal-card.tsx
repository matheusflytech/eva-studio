"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import {
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock,
  Hourglass,
  ListTodo,
  Mail,
  Maximize2,
  MessageCircle,
  Package,
  Phone,
  Tag,
  User,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { LAYOUT_PADRAO, type CampoDoCartao, type LayoutDoCartao } from "@/lib/cartao-layout";
import { VozDoQuadro } from "./eva-topo";
import { sinalHumano } from "./eva-voz";
import { dinheiro, iniciais, pedeAtencao, sinalDoNegocio, type IconeDoSinal, type NegocioKanban } from "./modelo";
import { blocosDoCartao, ehPersonalizado, textoDoCampo, tituloDoCartao, type ContextoDoCampo } from "./cartao";

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

/** Ícone das linhas simples do cartão (um por informação). */
const ICONE_DA_LINHA: Partial<Record<CampoDoCartao, LucideIcon>> = {
  previsao: CalendarDays,
  naEtapaHa: Hourglass,
  criadoEm: CalendarPlus,
  contato: User,
  telefone: Phone,
  email: Mail,
  produtos: Package,
};

export const TOM_DO_SINAL = {
  bad: "bg-danger/12 text-danger",
  warn: "bg-amber-400/12 text-amber-300",
  ok: "bg-emerald-400/12 text-emerald-400",
  neu: "bg-surface-3 text-text-secondary",
} as const;

/** Chip do próximo passo (um sinal só, do mais urgente para o menos). */
export function SinalDoProximoPasso({ deal, tipoDaEtapa, agora }: { deal: NegocioKanban; tipoDaEtapa: string; agora: Date }) {
  const humana = React.useContext(VozDoQuadro);
  const sinal = sinalDoNegocio(deal, tipoDaEtapa, agora);
  if (!sinal) return null;
  const Icone = ICONE[sinal.icone];
  const texto = humana ? sinalHumano(sinal.texto, sinal.tom) : sinal.texto;
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1 rounded-md px-[7px] py-0.5", TOM_DO_SINAL[sinal.tom])} title={texto}>
      <Icone size={12} aria-hidden className="shrink-0" />
      <span className="truncate">{texto}</span>
    </span>
  );
}

const pararArraste = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
  // Enter no link navega (não abre a prévia) e espaço não pega o cartão.
  onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
};

/**
 * Cartão do negócio, montado pelo layout do funil: as informações escolhidas,
 * na ordem escolhida, na densidade escolhida. O que não muda: borda âmbar
 * quando pede atenção, ponto do WhatsApp não lido e o título como link da
 * ficha completa (o resto do cartão abre a prévia).
 */
export function DealCard({
  deal,
  tipoDaEtapa,
  defs,
  agora,
  arrastando,
  layout = LAYOUT_PADRAO,
  comLink = false,
}: {
  deal: NegocioKanban;
  tipoDaEtapa: string;
  defs: DefinicaoDeCampo[];
  agora: Date;
  arrastando?: boolean;
  layout?: LayoutDoCartao;
  /** Título vira link para /negocios/<id>. Desligado no cartão que segue o mouse e nas prévias da configuração. */
  comLink?: boolean;
}) {
  const compacto = layout.densidade === "compacto";
  const { titulo, subtitulo } = tituloDoCartao(deal, layout.campos);
  const atencao = pedeAtencao(deal, tipoDaEtapa, agora);
  const blocos = blocosDoCartao(layout.campos, layout.densidade);
  const ctx: ContextoDoCampo = { tipoDaEtapa, agora, defs };
  const mostraWhatsapp = layout.campos.includes("whatsapp") && !!deal.whatsapp;
  const espaco = compacto ? "mt-1" : "mt-[9px]";

  const classeDoTitulo = "min-w-0 truncate text-[13px] font-medium text-text-primary";
  const elementoDoTitulo = comLink ? (
    <Link
      href={`/negocios/${deal.id}`}
      {...pararArraste}
      title="Abrir ficha completa"
      className={cn(
        classeDoTitulo,
        "rounded-sm underline-offset-2 outline-none hover:text-accent-400 hover:underline focus-visible:ring-2 focus-visible:ring-accent-500/60"
      )}
    >
      {titulo}
    </Link>
  ) : (
    <span className={classeDoTitulo}>{titulo}</span>
  );

  return (
    <div
      className={cn(
        "relative rounded-[10px] border bg-surface-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-[background-color,border-color,transform] duration-150",
        "group-hover/card:border-border-default group-hover/card:bg-surface-3 motion-reduce:transition-none",
        compacto ? "px-2.5 py-[7px]" : "px-3 py-[11px]",
        atencao ? "border-amber-400/35" : "border-border-subtle",
        arrastando && "rotate-[1.5deg] border-border-strong bg-surface-3 shadow-[0_12px_32px_rgba(0,0,0,0.5)]",
        tipoDaEtapa === "lost" && "opacity-65"
      )}
    >
      <div className="flex items-center gap-2">
        {!compacto && <Avatar nome={titulo} />}
        <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
          {elementoDoTitulo}
          {compacto && subtitulo && <span className="min-w-0 flex-1 truncate text-[11.5px] text-text-tertiary">{subtitulo}</span>}
        </span>
        {mostraWhatsapp && deal.whatsapp && (
          <span
            className="relative inline-flex shrink-0 text-[#25d366] transition-opacity group-hover/card:opacity-0"
            title={deal.whatsapp.naoLida ? "Mensagem não lida no WhatsApp" : "Tem conversa no WhatsApp"}
          >
            <MessageCircle size={compacto ? 13 : 15} aria-hidden />
            {deal.whatsapp.naoLida && (
              <span className="absolute -right-0.5 -top-0.5 h-[7px] w-[7px] rounded-full border-2 border-surface-2 bg-[#25d366]" />
            )}
          </span>
        )}
        {tipoDaEtapa === "lost" && <XCircle size={14} aria-label="Perdido" className="shrink-0 text-rose-400" />}
      </div>

      {!compacto && subtitulo && <p className="mt-1 truncate text-[12px] text-text-secondary">{subtitulo}</p>}

      {blocos.map((bloco, i) => {
        if (bloco.tipo === "metricas") {
          const partes = bloco.campos.map((c) => <Metrica key={c} campo={c} deal={deal} tipoDaEtapa={tipoDaEtapa} compacto={compacto} />);
          // Sem nada para mostrar (ex.: só chance, num negócio já fechado): não deixa linha vazia.
          if (!bloco.campos.some((c) => temMetrica(c, deal, tipoDaEtapa))) return null;
          return (
            <div key={i} className={cn(espaco, "flex items-center gap-2")}>
              {partes}
            </div>
          );
        }
        if (bloco.tipo === "etiquetas") {
          const itens = bloco.campos
            .map((c) => ({ c, def: defs.find((d) => d.key === c.slice(3)), texto: textoDoCampo(c, deal, ctx) }))
            .filter((i) => i.def && i.texto && !(i.def.type === "checkbox" && deal.customFields?.[i.def.key] !== true));
          if (itens.length === 0) return null;
          return (
            <div key={i} className={cn(compacto ? "mt-1" : "mt-2", "flex flex-wrap gap-1")}>
              {itens.map(({ c, def, texto }) => (
                <span
                  key={c}
                  title={def!.label}
                  className="max-w-full truncate rounded-md bg-surface-3/70 px-1.5 py-0.5 text-[11px] text-text-secondary"
                >
                  {def!.type === "checkbox" ? def!.label : ["select", "multiselect", "text"].includes(def!.type) ? texto : `${def!.label}: ${texto}`}
                </span>
              ))}
            </div>
          );
        }
        if (bloco.campo === "proximoPasso") {
          const sinal = sinalDoNegocio(deal, tipoDaEtapa, agora);
          if (!sinal) return null;
          return (
            <div key={i} className={cn(espaco, "flex items-center gap-1.5 text-[11.5px]")}>
              <SinalDoProximoPasso deal={deal} tipoDaEtapa={tipoDaEtapa} agora={agora} />
              {deal.openTasks > 1 && (
                <span className="text-[11px] tabular-nums text-text-tertiary" title={`${deal.openTasks} tarefas abertas`}>
                  +{deal.openTasks - 1}
                </span>
              )}
            </div>
          );
        }
        const texto = textoDoCampo(bloco.campo, deal, ctx, "curto");
        if (!texto) return null;
        const personalizado = ehPersonalizado(bloco.campo);
        const def = personalizado ? defs.find((d) => d.key === bloco.campo.slice(3)) : undefined;
        const Icone = personalizado ? Tag : ICONE_DA_LINHA[bloco.campo] ?? Tag;
        return (
          <p key={i} className={cn(compacto ? "mt-0.5" : "mt-1.5", "flex min-w-0 items-center gap-1.5 text-[11.5px] text-text-secondary")}>
            <Icone size={12} aria-hidden className="shrink-0 text-text-tertiary" />
            <span className="truncate">
              {def && <span className="text-text-tertiary">{def.label}: </span>}
              {texto}
            </span>
          </p>
        );
      })}
    </div>
  );
}

function temMetrica(campo: CampoDoCartao, deal: NegocioKanban, tipoDaEtapa: string): boolean {
  if (campo === "valor") return true;
  if (campo === "probabilidade") return tipoDaEtapa === "open";
  if (campo === "responsavel") return !!deal.owner;
  return false;
}

function Metrica({ campo, deal, tipoDaEtapa, compacto }: { campo: CampoDoCartao; deal: NegocioKanban; tipoDaEtapa: string; compacto: boolean }) {
  if (campo === "valor") {
    return (
      <span className={cn("font-display font-semibold tabular-nums text-text-primary", compacto ? "text-[13px]" : "text-[14px]")}>
        {deal.amountCents > 0 ? dinheiro(deal.amountCents) : <span className="font-sans text-[12px] font-normal text-text-tertiary">Sem valor</span>}
      </span>
    );
  }
  if (campo === "probabilidade") {
    if (tipoDaEtapa !== "open") return null;
    return (
      <span className="inline-flex items-center gap-2">
        <span className="h-[3px] w-[34px] overflow-hidden rounded-full bg-surface-3" aria-hidden>
          <span className="block h-full rounded-full bg-accent-500" style={{ width: `${deal.probability}%` }} />
        </span>
        <span className="text-[11px] tabular-nums text-text-tertiary" title="Chance de fechar">
          {deal.probability}%
        </span>
      </span>
    );
  }
  if (campo === "responsavel") {
    if (!deal.owner) return null;
    return (
      <span className="ml-auto">
        <Avatar nome={deal.owner.name || "Sem nome"} tamanho={compacto ? 16 : 18} rotulo={`Responsável: ${deal.owner.name || "sem nome"}`} />
      </span>
    );
  }
  return null;
}

/** Ações rápidas que aparecem ao passar o mouse (sem ocupar espaço em repouso). */
export function AcoesRapidas({ deal }: { deal: NegocioKanban }) {
  const classe =
    "grid h-6 w-6 place-items-center rounded-md border border-border-default bg-bg-base outline-none hover:border-border-strong focus-visible:ring-2 focus-visible:ring-accent-500/60";
  return (
    <div className="pointer-events-none absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity duration-150 group-hover/card:pointer-events-auto group-hover/card:opacity-100 group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100">
      {deal.whatsapp && (
        <Link
          href={`/conversas?c=${deal.whatsapp.conversationId}`}
          {...pararArraste}
          aria-label="Abrir conversa no WhatsApp"
          title="Abrir conversa"
          className={cn(classe, "text-[#25d366]")}
        >
          <MessageCircle size={13} aria-hidden />
        </Link>
      )}
      <Link
        href={`/negocios/${deal.id}`}
        {...pararArraste}
        aria-label="Abrir ficha completa"
        title="Abrir ficha completa"
        className={cn(classe, "text-text-secondary hover:text-text-primary")}
      >
        <Maximize2 size={12} aria-hidden />
      </Link>
    </div>
  );
}
