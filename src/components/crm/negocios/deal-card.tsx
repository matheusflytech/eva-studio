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
import { Avatar as AvatarDS } from "@/components/ui/avatar";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { focusRing } from "@/components/ui/styles";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { LAYOUT_PADRAO, type CampoDoCartao, type LayoutDoCartao } from "@/lib/cartao-layout";
import { VozDoQuadro } from "./eva-topo";
import { sinalHumano } from "./eva-voz";
import { dinheiro, estaParado, sinalDoNegocio, tempoNaEtapa, type IconeDoSinal, type NegocioKanban, type SinalDoNegocio } from "./modelo";
import { blocosDoCartao, ehPersonalizado, textoDoCampo, tituloDoCartao, type ContextoDoCampo } from "./cartao";

/**
 * Avatar de pessoa no quadro (compatível com a API antiga: nome/tamanho).
 * Iniciais em cinza do design system, nunca cor por pessoa.
 */
export function Avatar({ nome, tamanho = 24, rotulo }: { nome: string; tamanho?: number; rotulo?: string }) {
  const size = tamanho <= 24 ? "sm" : tamanho <= 32 ? "md" : "lg";
  return (
    <span title={rotulo ?? nome} className="inline-flex">
      <AvatarDS name={nome} size={size} />
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

/** Tom do sinal → variante do Badge (cor só em status). */
export const TOM_DO_SINAL: Record<SinalDoNegocio["tom"], NonNullable<BadgeProps["variant"]>> = {
  bad: "danger",
  warn: "warning",
  ok: "success",
  neu: "neutral",
};

/** Tom do sinal → cor do texto (cartão v5: sem cápsula, a cor diz o estado). */
const COR_DO_SINAL: Record<SinalDoNegocio["tom"], string> = {
  bad: "text-danger",
  warn: "text-warning",
  ok: "text-success",
  neu: "text-text-tertiary",
};

/** O próximo passo (um sinal só, do mais urgente para o menos). */
export function SinalDoProximoPasso({
  deal,
  tipoDaEtapa,
  agora,
  prazoParado,
  variante = "badge",
}: {
  deal: NegocioKanban;
  tipoDaEtapa: string;
  agora: Date;
  /** Prazo de parado da etapa (null = nunca; ausente = 7). */
  prazoParado?: number | null;
  /** "texto": só ícone e texto na cor do status (cartão v5); "badge": cápsula (prévia). */
  variante?: "badge" | "texto";
}) {
  const humana = React.useContext(VozDoQuadro);
  const sinal = sinalDoNegocio(deal, tipoDaEtapa, agora, prazoParado);
  if (!sinal) return null;
  const Icone = ICONE[sinal.icone];
  const texto = humana ? sinalHumano(sinal.texto, sinal.tom) : sinal.texto;
  if (variante === "texto") {
    return (
      <span className={cn("inline-flex min-w-0 items-center gap-1 text-caption font-medium", COR_DO_SINAL[sinal.tom])} title={texto}>
        <Icone size={13} aria-hidden="true" className="shrink-0" />
        <span className="truncate">{texto}</span>
      </span>
    );
  }
  return (
    <Badge variant={TOM_DO_SINAL[sinal.tom]} className="min-w-0 max-w-full" title={texto}>
      <Icone size={12} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{texto}</span>
    </Badge>
  );
}

const pararArraste = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
  // Enter no link navega (não abre a prévia) e espaço não pega o cartão.
  onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
};

/** Campos que o cartão v5 já mostra do seu jeito (título, valor e chance, sinal, dono, WhatsApp). */
const FIXOS_DO_CARTAO = new Set<CampoDoCartao>(["empresa", "nome", "valor", "probabilidade", "responsavel", "whatsapp", "proximoPasso"]);

/**
 * Cartão do negócio (v5): título, valor com a chance e o sinal do próximo
 * passo, com o avatar do dono à direita. Empresa, etiquetas e o resto moram
 * no detalhe; campos além desses que o funil escolheu (previsão, contato,
 * campos personalizados...) continuam aparecendo, na ordem escolhida.
 * Parado ganha a borda esquerda âmbar. O título é o link da ficha (o resto
 * do cartão abre a prévia). Superfície única, sem sombra parada.
 */
export function DealCard({
  deal,
  tipoDaEtapa,
  defs,
  agora,
  arrastando,
  layout = LAYOUT_PADRAO,
  comLink = false,
  prazoParado,
}: {
  deal: NegocioKanban;
  tipoDaEtapa: string;
  /** Prazo de parado da etapa (regra da etapa; null = nunca; ausente = 7). */
  prazoParado?: number | null;
  defs: DefinicaoDeCampo[];
  agora: Date;
  arrastando?: boolean;
  layout?: LayoutDoCartao;
  /** Título vira link para /negocios/<id>. Desligado no cartão que segue o mouse e nas prévias da configuração. */
  comLink?: boolean;
}) {
  const compacto = layout.densidade === "compacto";
  // Título é o nome do negócio; só vira a empresa quando o funil tirou o nome e deixou a empresa.
  const titulo =
    layout.campos.includes("empresa") && !layout.campos.includes("nome") ? tituloDoCartao(deal, layout.campos).titulo : deal.name;
  const extras = layout.campos.filter((c) => !FIXOS_DO_CARTAO.has(c));
  const blocos = blocosDoCartao(extras, layout.densidade);
  const ctx: ContextoDoCampo = { tipoDaEtapa, agora, defs, prazoParado };
  const mostraWhatsapp = layout.campos.includes("whatsapp") && !!deal.whatsapp;
  const aberto = tipoDaEtapa === "open";
  const parado = estaParado(deal, tipoDaEtapa, agora, prazoParado);
  const temSinal = !!sinalDoNegocio(deal, tipoDaEtapa, agora, prazoParado);
  const tempo = tempoNaEtapa(deal.stageSince, agora);

  const classeDoTitulo = "min-w-0 truncate text-small font-semibold text-text-primary";
  const elementoDoTitulo = comLink ? (
    <Link
      href={`/negocios/${deal.id}`}
      {...pararArraste}
      title="Abrir ficha completa"
      className={cn(classeDoTitulo, "rounded-sm underline-offset-2 hover:underline", focusRing)}
    >
      {titulo}
    </Link>
  ) : (
    <span className={classeDoTitulo}>{titulo}</span>
  );

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-[14px] border border-border-subtle bg-panel transition-colors duration-120",
        "group-hover/card:border-border-strong",
        compacto ? "gap-1 px-3 py-2" : "gap-1.5 px-3 py-2.5",
        parado && "border-l-[3px] border-l-warning",
        arrastando && "border-border-strong shadow-overlay",
        tipoDaEtapa === "lost" && "opacity-70"
      )}
    >
      <div className="flex items-center gap-2">
        {elementoDoTitulo}
        {mostraWhatsapp && deal.whatsapp && (
          <span
            className="relative ml-auto inline-flex shrink-0 text-success transition-opacity group-hover/card:opacity-0"
            title={deal.whatsapp.naoLida ? "Mensagem não lida no WhatsApp" : "Tem conversa no WhatsApp"}
          >
            <MessageCircle size={14} aria-hidden="true" />
            {deal.whatsapp.naoLida && (
              <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-success ring-2 ring-panel">
                <span className="sr-only">Mensagem não lida</span>
              </span>
            )}
          </span>
        )}
        {tipoDaEtapa === "lost" && <XCircle size={14} aria-label="Perdido" className="ml-auto shrink-0 text-danger" />}
      </div>

      <div className="flex items-baseline gap-1.5">
        {deal.amountCents > 0 ? (
          <span className="text-small font-semibold tabular-nums text-text-primary">{dinheiro(deal.amountCents)}</span>
        ) : (
          <span className="text-small text-text-tertiary">Sem valor</span>
        )}
        {aberto && (
          <span className="font-mono text-caption tabular-nums text-text-tertiary" title="Chance de fechar">
            {deal.probability}%
          </span>
        )}
      </div>

      {blocos.map((bloco, i) => {
        if (bloco.tipo === "metricas") return null;
        if (bloco.tipo === "etiquetas") {
          const itens = bloco.campos
            .map((c) => ({ c, def: defs.find((d) => d.key === c.slice(3)), texto: textoDoCampo(c, deal, ctx) }))
            .filter((i) => i.def && i.texto && !(i.def.type === "checkbox" && deal.customFields?.[i.def.key] !== true));
          if (itens.length === 0) return null;
          return (
            <div key={i} className="flex flex-wrap gap-1">
              {itens.map(({ c, def, texto }) => (
                <Badge key={c} title={def!.label} className="max-w-full truncate">
                  {def!.type === "checkbox" ? def!.label : ["select", "multiselect", "text"].includes(def!.type) ? texto : `${def!.label}: ${texto}`}
                </Badge>
              ))}
            </div>
          );
        }
        const texto = textoDoCampo(bloco.campo, deal, ctx, "curto");
        if (!texto) return null;
        const personalizado = ehPersonalizado(bloco.campo);
        const def = personalizado ? defs.find((d) => d.key === bloco.campo.slice(3)) : undefined;
        const Icone = personalizado ? Tag : ICONE_DA_LINHA[bloco.campo] ?? Tag;
        return (
          <p key={i} className="flex min-w-0 items-center gap-1.5 text-caption text-text-secondary">
            <Icone size={12} aria-hidden="true" className="shrink-0 text-text-tertiary" />
            <span className="truncate">
              {def && <span className="text-text-tertiary">{def.label}: </span>}
              {texto}
            </span>
          </p>
        );
      })}

      {(temSinal || aberto || deal.owner) && (
        <div className="flex min-h-5 items-center gap-1.5">
          {temSinal ? (
            <>
              <SinalDoProximoPasso deal={deal} tipoDaEtapa={tipoDaEtapa} agora={agora} prazoParado={prazoParado} variante="texto" />
              {deal.openTasks > 1 && (
                <span className="font-mono text-caption tabular-nums text-text-tertiary" title={`${deal.openTasks} tarefas abertas`}>
                  +{deal.openTasks - 1}
                </span>
              )}
            </>
          ) : (
            aberto && (
              <span className="font-mono text-caption text-text-tertiary" title="Tempo nesta etapa">
                {tempo === "agora" ? "entrou agora" : `há ${tempo}`}
              </span>
            )
          )}
          {deal.owner && (
            <span className="ml-auto shrink-0">
              <Avatar nome={deal.owner.name || "Sem nome"} rotulo={`Responsável: ${deal.owner.name || "sem nome"}`} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

/** Ações rápidas que aparecem ao passar o mouse (sem ocupar espaço em repouso). */
export function AcoesRapidas({ deal }: { deal: NegocioKanban }) {
  const classe = cn(
    "grid h-6 w-6 place-items-center rounded-full border border-border-subtle bg-panel text-text-secondary hover:bg-hover hover:text-text-primary",
    focusRing
  );
  return (
    <div className="pointer-events-none absolute right-1.5 top-1.5 z-10 flex gap-1 opacity-0 transition-opacity duration-120 group-hover/card:pointer-events-auto group-hover/card:opacity-100 group-focus-within/card:pointer-events-auto group-focus-within/card:opacity-100">
      {deal.whatsapp && (
        <Link href={`/conversas?c=${deal.whatsapp.conversationId}`} {...pararArraste} aria-label="Abrir conversa no WhatsApp" title="Abrir conversa" className={classe}>
          <MessageCircle size={13} aria-hidden="true" />
        </Link>
      )}
      <Link href={`/negocios/${deal.id}`} {...pararArraste} aria-label="Abrir ficha completa" title="Abrir ficha completa" className={classe}>
        <Maximize2 size={12} aria-hidden="true" />
      </Link>
    </div>
  );
}
