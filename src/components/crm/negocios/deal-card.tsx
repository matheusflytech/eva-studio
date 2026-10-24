"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  Hourglass,
  ListPlus,
  ListTodo,
  Mail,
  Maximize2,
  MoreHorizontal,
  Phone,
  StickyNote,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LogoOficial } from "@/components/ui/logo-oficial";
import { Avatar as AvatarDS } from "@/components/ui/avatar";
import { Badge, type BadgeProps } from "@/components/ui/badge";
import { focusRing } from "@/components/ui/styles";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { LAYOUT_PADRAO, ROTULO_DA_ACAO, rotuloDoCampo, type AcaoDoCartao, type LayoutDoCartao } from "@/lib/cartao-layout";
import { VozDoQuadro } from "./eva-topo";
import { sinalHumano } from "./eva-voz";
import { sinalDoNegocio, type IconeDoSinal, type NegocioKanban, type SinalDoNegocio } from "./modelo";
import { acoesDisponiveis, linhasDoCartao, rotulosPersonalizados, textoDoCampo, topoDoCartao, type ContextoDoCampo } from "./cartao";
import { QuadroContexto } from "./quadro-contexto";
import { urlDoAvatar } from "@/lib/avatar";

/**
 * Avatar de pessoa no quadro (compatível com a API antiga: nome/tamanho).
 * Iniciais em cinza do design system, nunca cor por pessoa.
 */
export function Avatar({ nome, tamanho = 24, rotulo, foto }: { nome: string; tamanho?: number; rotulo?: string; foto?: string | null }) {
  const size = tamanho <= 24 ? "sm" : tamanho <= 32 ? "md" : "lg";
  return (
    <span title={rotulo ?? nome} className="inline-flex">
      <AvatarDS name={nome} size={size} src={urlDoAvatar(foto)} />
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

export const pararArraste = {
  onPointerDown: (e: React.PointerEvent) => e.stopPropagation(),
  onClick: (e: React.MouseEvent) => e.stopPropagation(),
  // Enter no link navega (não abre o painel) e espaço não pega o cartão.
  onKeyDown: (e: React.KeyboardEvent) => e.stopPropagation(),
};

const ICONE_DA_ACAO: Record<Exclude<AcaoDoCartao, "whatsapp">, LucideIcon> = {
  ligar: Phone,
  tarefa: ListPlus,
  nota: StickyNote,
};

/**
 * Cartão do negócio (quadro v4, exemplo 1 do Matheus): em cima a pessoa (foto
 * e nome do contato principal, o negócio embaixo) e o "⋯"; no meio os pares
 * rótulo/valor que a pessoa escolheu (padrão: Valor, Previsão, Responsável);
 * no rodapé os ícones de ação e o sinal do próximo passo. Sem borda de
 * atraso: o atraso é o texto do sinal. Clicar no cartão abre o painel.
 */
export function DealCard({
  deal,
  tipoDaEtapa,
  defs,
  agora,
  arrastando,
  layout = LAYOUT_PADRAO,
  prazoParado,
  nomeDaEtapa,
}: {
  deal: NegocioKanban;
  tipoDaEtapa: string;
  /** Prazo de parado da etapa (regra da etapa; null = nunca; ausente = 7). */
  prazoParado?: number | null;
  defs: DefinicaoDeCampo[];
  agora: Date;
  arrastando?: boolean;
  layout?: LayoutDoCartao;
  nomeDaEtapa?: string;
  /** Mantido por compatibilidade (o título não é mais link: o cartão abre o painel). */
  comLink?: boolean;
}) {
  const quadro = React.useContext(QuadroContexto);
  const compacto = layout.densidade === "compacto";
  const topo = topoDoCartao(deal, layout.campos);
  const ctx: ContextoDoCampo = { tipoDaEtapa, agora, defs, prazoParado, nomeDaEtapa };
  // Campo personalizado vazio não ocupa o cartão; os padrões mostram "—".
  const linhas = linhasDoCartao(layout.campos)
    .filter((c) => c !== "proximoPasso")
    .map((campo) => ({ campo, texto: textoDoCampo(campo, deal, ctx) }))
    .filter((l) => l.texto || !l.campo.startsWith("cf:"));
  const rotulos = rotulosPersonalizados(defs);
  const acoes = acoesDisponiveis(deal, layout.acoes);
  const temSinal = !!sinalDoNegocio(deal, tipoDaEtapa, agora, prazoParado);

  return (
    <div
      data-cartao
      className={cn(
        "relative flex flex-col rounded-[16px] border border-border-subtle bg-panel",
        "shadow-[0_1px_2px_rgb(0_0_0/0.04)] transition-[transform,box-shadow,border-color] duration-200 ease-[cubic-bezier(.2,0,0,1)]",
        "group-hover/card:-translate-y-0.5 group-hover/card:border-border-default group-hover/card:shadow-[0_8px_24px_-12px_rgb(0_0_0/0.18)]",
        compacto ? "gap-2 p-2.5" : "gap-2.5 p-3",
        arrastando && "border-border-default shadow-overlay",
        tipoDaEtapa === "lost" && "opacity-75"
      )}
    >
      {/* Topo: a pessoa (ou o negócio) e o "⋯". */}
      <div className="flex items-center gap-2.5">
        <Avatar nome={topo.foto || "?"} tamanho={compacto ? 24 : 32} foto={topo.ehContato ? deal.contacts[0]?.avatarPath : null} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-small font-semibold text-text-primary">{topo.titulo}</p>
          {topo.subtitulo && <p className="truncate text-caption text-text-tertiary">{topo.subtitulo}</p>}
        </div>
        <MenuDoCartao deal={deal} />
      </div>

      {/* Corpo: pares rótulo/valor. */}
      {linhas.length > 0 && (
        <dl className={cn("flex flex-col border-t border-border-subtle", compacto ? "gap-1 pt-2" : "gap-2 pt-2.5")}>
          {linhas.map(({ campo, texto }) => {
            return (
              <div key={campo} className={cn(compacto && "flex items-baseline justify-between gap-2")}>
                <dt className="text-[11px] leading-4 text-text-tertiary">{rotuloDoCampo(campo, rotulos)}</dt>
                <dd className={cn("truncate text-small leading-5", texto ? "font-medium text-text-primary" : "text-text-tertiary", campo === "valor" && "tabular-nums")}>
                  {campo === "responsavel" && deal.owner ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Avatar nome={deal.owner.name || "Sem nome"} tamanho={20} foto={deal.owner.avatarPath} />
                      <span className="truncate">{texto}</span>
                    </span>
                  ) : (
                    texto || "—"
                  )}
                </dd>
              </div>
            );
          })}
        </dl>
      )}

      {/* Rodapé: ações e o próximo passo. */}
      {(acoes.length > 0 || temSinal) && (
        <div className={cn("flex items-center gap-1.5 border-t border-border-subtle", compacto ? "pt-2" : "pt-2.5")}>
          {acoes.map((a) => (
            <BotaoDeAcao key={a.acao} acao={a.acao} href={a.href} deal={deal} interativo={!!quadro && !arrastando} />
          ))}
          {temSinal && (
            <span className="ml-auto flex min-w-0">
              <SinalDoProximoPasso deal={deal} tipoDaEtapa={tipoDaEtapa} agora={agora} prazoParado={prazoParado} variante="texto" />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const CLASSE_DA_ACAO = cn(
  "grid size-7 shrink-0 place-items-center rounded-full border border-border-subtle text-text-tertiary",
  "transition-colors duration-150 hover:border-border-default hover:bg-hover hover:text-text-primary group-hover/card:text-text-secondary",
  focusRing
);

function BotaoDeAcao({ acao, href, deal, interativo }: { acao: AcaoDoCartao; href?: string; deal: NegocioKanban; interativo: boolean }) {
  const quadro = React.useContext(QuadroContexto);
  const rotulo = ROTULO_DA_ACAO[acao];
  const Icone = acao === "whatsapp" ? null : ICONE_DA_ACAO[acao];
  const icone = Icone ? <Icone size={13} aria-hidden="true" /> : <LogoOficial marca="whatsapp" tamanho={13} />;
  if (!interativo) {
    return (
      <span className={CLASSE_DA_ACAO} aria-hidden="true">
        {icone}
      </span>
    );
  }
  if (href) {
    const naoLida = acao === "whatsapp" && deal.whatsapp?.naoLida;
    return href.startsWith("tel:") ? (
      <a href={href} {...pararArraste} aria-label={`${rotulo}: ${deal.contacts[0]?.name ?? deal.name}`} title={rotulo} className={CLASSE_DA_ACAO}>
        {icone}
      </a>
    ) : (
      <Link href={href} {...pararArraste} aria-label={naoLida ? `${rotulo} (mensagem não lida)` : rotulo} title={rotulo} className={cn(CLASSE_DA_ACAO, "relative")}>
        {icone}
        {naoLida && <span aria-hidden="true" className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-success ring-2 ring-panel" />}
      </Link>
    );
  }
  return (
    <button
      type="button"
      {...pararArraste}
      onClick={(e) => {
        e.stopPropagation();
        quadro?.onAbrir(deal, acao === "tarefa" ? "tarefa" : "nota");
      }}
      aria-label={rotulo}
      title={rotulo}
      className={CLASSE_DA_ACAO}
    >
      {icone}
    </button>
  );
}

/** "⋯" do cartão: abrir a ficha e mover de etapa sem arrastar. */
function MenuDoCartao({ deal }: { deal: NegocioKanban }) {
  const quadro = React.useContext(QuadroContexto);
  if (!quadro) return <MoreHorizontal size={15} aria-hidden="true" className="shrink-0 text-text-tertiary" />;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          {...pararArraste}
          aria-label={`Ações de ${deal.name}`}
          className={cn("grid size-7 shrink-0 place-items-center rounded-full text-text-tertiary hover:bg-hover hover:text-text-primary", focusRing)}
        >
          <MoreHorizontal size={15} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem asChild>
          <Link href={`/negocios/${deal.id}`}>
            <Maximize2 size={14} aria-hidden="true" /> Abrir ficha completa
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Mover para</DropdownMenuLabel>
        {quadro.etapas.map((e) => (
          <DropdownMenuItem key={e.id} onSelect={() => quadro.onMover(deal, e.id)}>
            {e.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
