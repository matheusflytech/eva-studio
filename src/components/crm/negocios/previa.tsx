"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "@/components/contrato/link";
import {
  Building2,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  CircleDollarSign,
  Clock,
  Hourglass,
  Layers,
  Loader2,
  Mail,
  Maximize2,
  MoreHorizontal,
  Package,
  Percent,
  Phone,
  Plus,
  RotateCcw,
  Settings2,
  Tag,
  User,
  X,
  XCircle,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { LogoOficial } from "@/components/ui/logo-oficial";
import type { PedidoDeMudanca, ResultadoDaTentativa } from "./mudanca-de-etapa";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { focusRing } from "@/components/ui/styles";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { ROTULO_DA_SECAO, rotuloDoCampo, type CampoDoCartao, type LayoutDoCartao, type SecaoDoPainel } from "@/lib/cartao-layout";
import { Avatar, SinalDoProximoPasso } from "./deal-card";
import { ehPersonalizado, rotulosPersonalizados, textoDoCampo } from "./cartao";
import { dinheiro, type NegocioKanban } from "./modelo";
import { useToast } from "@/components/ui/toast";
import { useRegistroEmFoco, type RegistroEmFoco } from "@/components/busca/registro-em-foco";
import { LinhaDoTempoView, NovaNota, TarefasDoNegocio } from "@/components/crm/negocio/atividade";
import { useFicha } from "@/components/crm/negocio/use-ficha";
import type { ItemDoNegocio } from "@/lib/produtos";
import type { FocoDoPainel } from "./quadro-contexto";
import { CURVA, gsap, reduzMovimento, useGSAP } from "./animacao/gsap";

export interface EtapaDaPrevia {
  id: string;
  name: string;
  type: string;
  color: string;
  /** Regra da etapa: prazo de parado (null = nunca) e orientação. */
  rottingDays?: number | null;
  guidance?: string;
}

/** Ícone de cada linha de "Detalhes" (exemplo 2: ícone, rótulo e valor). */
const ICONE_DO_CAMPO: Partial<Record<CampoDoCartao, LucideIcon>> = {
  empresa: Building2,
  nome: Tag,
  valor: CircleDollarSign,
  probabilidade: Percent,
  responsavel: User,
  previsao: CalendarClock,
  naEtapaHa: Hourglass,
  criadoEm: CalendarPlus,
  contato: User,
  telefone: Phone,
  email: Mail,
  produtos: Package,
  etapa: Layers,
  ultimaInteracao: Clock,
  proximoPasso: Zap,
};

/**
 * "Detalhes" do painel (e a prévia ao vivo da configuração do cartão): os
 * campos que a pessoa escolheu, cada um com ícone, rótulo e valor. A etapa
 * pode virar um seletor (`etapaEditavel`), que move com as regras.
 */
export function ConteudoDaPrevia({
  deal,
  etapa,
  layout,
  defs,
  agora,
  etapaEditavel,
}: {
  deal: NegocioKanban;
  etapa: EtapaDaPrevia;
  layout: LayoutDoCartao;
  defs: DefinicaoDeCampo[];
  agora: Date;
  /** Seletor de etapa no lugar do texto (painel do quadro). */
  etapaEditavel?: React.ReactNode;
  /** Compatibilidade: o título agora mora no topo do painel. */
  idDoTitulo?: string;
  comLink?: boolean;
}) {
  const ctx = { tipoDaEtapa: etapa.type, agora, defs, prazoParado: etapa.rottingDays, nomeDaEtapa: etapa.name };
  const rotulos = rotulosPersonalizados(defs);
  const aberto = etapa.type === "open";

  return (
    <div className="flex flex-col gap-3">
      {etapa.guidance && aberto && (
        <p className="whitespace-pre-line rounded-[12px] bg-raised px-3 py-2 text-caption text-text-secondary">
          <span className="font-medium text-text-primary">Nesta etapa: </span>
          {etapa.guidance}
        </p>
      )}
      <dl className="flex flex-col">
        {layout.previa.map((campo) => {
          const Icone = ehPersonalizado(campo) ? Tag : ICONE_DO_CAMPO[campo] ?? Tag;
          const valor =
            campo === "etapa" && etapaEditavel ? (
              etapaEditavel
            ) : campo === "proximoPasso" ? (
              <SinalDoProximoPasso deal={deal} tipoDaEtapa={etapa.type} agora={agora} prazoParado={etapa.rottingDays} />
            ) : campo === "valor" ? (
              <span className="tabular-nums">{deal.amountCents > 0 ? dinheiro(deal.amountCents) : "—"}</span>
            ) : campo === "responsavel" && deal.owner ? (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <Avatar nome={deal.owner.name || "Sem nome"} tamanho={20} />
                <span className="truncate">{deal.owner.name}</span>
              </span>
            ) : (
              textoDoCampo(campo, deal, ctx) || <span className="text-text-tertiary">—</span>
            );
          return (
            <div key={campo} className="grid min-h-9 grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)] items-center gap-3 py-1 text-small">
              <dt className="flex min-w-0 items-center gap-2 text-text-tertiary">
                <Icone size={15} aria-hidden="true" className="shrink-0" />
                <span className="truncate">{rotuloDoCampo(campo, rotulos)}</span>
              </dt>
              <dd className="min-w-0 break-words font-medium text-text-primary">{valor}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/**
 * Painel do negócio (quadro v4, exemplo 2): abre por cima do quadro, pela
 * direita, sem escurecer o fundo. Topo com o título, ⤢ (ficha completa),
 * "⋯" e fechar; embaixo as seções que a pessoa escolheu (Detalhes, Contato
 * principal, Atividade recente, Tarefas, Produtos). Clicar em outro cartão
 * troca o conteúdo sem fechar. Esc ou clique fora fecha; o foco volta ao
 * cartão.
 */
export function PreviaDoNegocio({
  deal,
  etapa,
  etapas,
  layout,
  defs,
  agora,
  onFechar,
  onMudou,
  pipelineId,
  onMover,
  foco,
  onPersonalizar,
}: {
  deal: NegocioKanban;
  etapa: EtapaDaPrevia;
  /** Etapas do funil, na ordem: o seletor de mover e os botões Ganho/Perdido. */
  etapas: EtapaDaPrevia[];
  layout: LayoutDoCartao;
  defs: DefinicaoDeCampo[];
  agora: Date;
  onFechar: () => void;
  onMudou: () => void;
  pipelineId: string;
  /** Mudança de etapa com as regras (useMudancaDeEtapa da tela). */
  onMover: (pedido: PedidoDeMudanca) => Promise<ResultadoDaTentativa>;
  /** Abriu pela ação do cartão: já na criação de tarefa ou de nota. */
  foco?: FocoDoPainel;
  onPersonalizar?: () => void;
}) {
  const painel = React.useRef<HTMLElement>(null);
  const miolo = React.useRef<HTMLDivElement>(null);
  const devolverFoco = React.useRef(true);
  const fechando = React.useRef(false);
  const [movendo, setMovendo] = React.useState<string | null>(null);
  const idDoTitulo = React.useId();
  const dealId = deal.id;
  const ficha = useFicha(dealId);

  // Fechar desliza o painel para fora antes de sumir (menos movimento: some direto).
  const fecharAnimado = React.useCallback(() => {
    const el = painel.current;
    if (fechando.current) return;
    fechando.current = true;
    if (!el || reduzMovimento()) return onFechar();
    gsap.to(el, { x: 28, autoAlpha: 0, duration: 0.2, ease: CURVA.saida, onComplete: onFechar });
  }, [onFechar]);
  const fechar = React.useRef(fecharAnimado);
  React.useEffect(() => {
    fechar.current = fecharAnimado;
  });

  // Abrir: o painel nasce do cartão clicado e cresce até a lateral; as
  // seções entram em sequência. Menos movimento: só esmaece.
  useGSAP(
    () => {
      const el = painel.current;
      if (!el) return;
      if (reduzMovimento()) {
        gsap.from(el, { autoAlpha: 0, duration: 0.15 });
        return;
      }
      const cartao = document.querySelector<HTMLElement>(`[data-deal-id="${CSS.escape(dealId)}"]`);
      const a = cartao?.getBoundingClientRect();
      const b = el.getBoundingClientRect();
      const tl = gsap.timeline();
      if (a && a.width > 0) {
        tl.from(el, {
          x: a.left - b.left,
          y: a.top - b.top,
          scaleX: a.width / b.width,
          scaleY: a.height / b.height,
          transformOrigin: "top left",
          autoAlpha: 0.4,
          duration: 0.42,
          ease: CURVA.voo,
          clearProps: "transform,opacity,visibility",
        });
      } else {
        tl.from(el, { x: 32, autoAlpha: 0, duration: 0.32, ease: CURVA.entrada, clearProps: "transform,opacity,visibility" });
      }
      tl.from("[data-secao]", { y: 10, autoAlpha: 0, stagger: 0.05, duration: 0.28, ease: CURVA.entrada, clearProps: "transform,opacity,visibility" }, "-=0.18");
    },
    { scope: painel }
  );

  // Trocar de negócio com o painel aberto: o conteúdo cruza (sai e entra).
  const primeiraTroca = React.useRef(true);
  useGSAP(
    () => {
      if (primeiraTroca.current) {
        primeiraTroca.current = false;
        return;
      }
      if (!miolo.current || reduzMovimento()) return;
      gsap.fromTo(miolo.current, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.18, ease: CURVA.entrada, clearProps: "transform,opacity,visibility" });
    },
    { dependencies: [dealId], scope: painel }
  );

  // Fechou de verdade (não só trocou de negócio): só aí o foco volta ao cartão.
  const montado = React.useRef(true);
  React.useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  React.useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // Aberto pela ação Tarefa/Nota, o campo já pegou o foco (autoFocus): não tira.
    if (!painel.current?.contains(document.activeElement)) painel.current?.focus({ preventScroll: true });
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        fechar.current();
      }
    };
    // Clique fora fecha sem devolver o foco, menos em outro cartão: esse troca o conteúdo.
    const aoApontar = (e: PointerEvent) => {
      if (!(e.target instanceof Element)) return;
      if (e.target.closest("[data-busca-global]") || e.target.closest("[data-deal-id]")) return;
      // Menus e modais abertos a partir do painel (portal) não são "fora".
      if (e.target.closest("[role='menu'], [role='dialog'], [data-radix-popper-content-wrapper]")) return;
      if (painel.current && !painel.current.contains(e.target)) {
        devolverFoco.current = false;
        fechar.current();
      }
    };
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("pointerdown", aoApontar, true);
    const flag = devolverFoco;
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("pointerdown", aoApontar, true);
      if (!flag.current || montado.current) return;
      const cartao = document.querySelector<HTMLElement>(`[data-deal-id="${CSS.escape(dealId)}"]`) ?? anterior;
      cartao?.focus({ preventScroll: true });
    };
  }, [dealId]);

  async function mover(stageId: string, extra?: Record<string, unknown>) {
    const para = etapas.find((s) => s.id === stageId);
    if (!extra?.reabrir && (!para || stageId === etapa.id)) return;
    setMovendo(stageId || "reabrir");
    const r = await onMover({
      dealId: deal.id,
      nome: deal.name,
      pipelineId,
      para: para ?? { id: "", name: "", type: "open" },
      defs,
      // Negócio fechado escolhendo outra etapa no seletor: reabre junto.
      extra: extra ?? (etapa.type !== "open" ? { reabrir: true } : undefined),
      de: { id: etapa.id, name: etapa.name, type: etapa.type },
      aoDesfazer: onMudou,
    });
    setMovendo(null);
    if (r === "movido") {
      onMudou();
      void ficha.carregar();
    }
  }

  // Busca global (⌘K): com o painel aberto, as ações deste negócio vêm primeiro.
  const moverRef = React.useRef(mover);
  const mudouRef = React.useRef(onMudou);
  React.useEffect(() => {
    moverRef.current = mover;
    mudouRef.current = onMudou;
  });
  const toast = useToast();
  const registro = React.useMemo<RegistroEmFoco>(() => {
    const principal = deal.contacts[0];
    return {
      tipo: "negocio",
      id: deal.id,
      titulo: deal.name || "Negócio sem nome",
      caminho: `/negocios/${deal.id}`,
      subtitulo: [deal.company?.name, etapa.name].filter(Boolean).join(" · "),
      etapas: etapas.map((s) => ({ id: s.id, nome: s.name, tipo: s.type })),
      etapaAtualId: etapa.id,
      aoMudarEtapa: (id) => void moverRef.current(id),
      donoAtualId: deal.owner?.id ?? null,
      aoAtribuir: async (userId) => {
        const res = await fetch(`/api/deals/${deal.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ownerId: userId }),
        }).catch(() => null);
        if (res?.ok) mudouRef.current();
        else toast({ title: "Não foi possível trocar o responsável.", tone: "danger" });
      },
      whatsapp: principal
        ? { nome: principal.name || "o contato", telefone: principal.phone, conversaId: deal.whatsapp?.conversationId }
        : null,
      tarefa: { dealId: deal.id },
    };
  }, [deal, etapa, etapas, toast]);
  useRegistroEmFoco(registro);

  const aberto = etapa.type === "open";
  const etapaGanha = etapas.find((s) => s.type === "won");
  const etapaPerdida = etapas.find((s) => s.type === "lost");
  // Foco da ação do cartão: a seção pedida aparece mesmo que a pessoa a tenha desligado.
  const secoes: SecaoDoPainel[] = [...layout.secoes];
  if (foco === "tarefa" && !secoes.includes("tarefas")) secoes.push("tarefas");
  if (foco === "nota" && !secoes.includes("atividade")) secoes.push("atividade");

  const seletorDeEtapa = (
    <span className="flex min-w-0 items-center gap-2">
      <Select
        aria-label="Etapa"
        value={etapa.id}
        disabled={!!movendo}
        onChange={(e) => mover(e.target.value)}
        className="h-8 min-w-0 flex-1"
      >
        {etapas.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      {movendo && <Loader2 size={14} className="shrink-0 animate-spin text-text-tertiary" aria-label="Movendo" />}
    </span>
  );

  return createPortal(
    <aside
      ref={painel}
      role="dialog"
      aria-modal="false"
      aria-labelledby={idDoTitulo}
      tabIndex={-1}
      className="fixed bottom-3 right-3 top-3 z-50 flex w-[440px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-[22px] border border-border-subtle bg-overlay shadow-overlay outline-none"
    >
      <header className="flex items-start gap-2 border-b border-border-subtle px-5 pb-3.5 pt-4">
        <div className="min-w-0 flex-1">
          <h2 id={idDoTitulo} className="text-title-sm font-semibold leading-snug text-text-primary">
            {deal.name || "Negócio sem nome"}
          </h2>
          {(deal.company?.name || deal.contacts[0]?.name) && (
            <p className="mt-0.5 truncate text-small text-text-tertiary">{deal.company?.name || deal.contacts[0]?.name}</p>
          )}
        </div>
        <span className="flex shrink-0 items-center gap-0.5">
          <Link href={`/negocios/${deal.id}`} aria-label="Abrir ficha completa" title="Abrir ficha completa" className={CLASSE_DO_ICONE}>
            <Maximize2 size={15} aria-hidden="true" />
          </Link>
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Mais ações" className={CLASSE_DO_ICONE}>
                <MoreHorizontal size={16} aria-hidden="true" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {onPersonalizar && (
                <DropdownMenuItem onSelect={onPersonalizar}>
                  <Settings2 size={14} aria-hidden="true" /> Personalizar painel
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link href={`/negocios/${deal.id}`}>
                  <Maximize2 size={14} aria-hidden="true" /> Abrir ficha completa
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <button type="button" onClick={fecharAnimado} aria-label="Fechar painel" title="Fechar (Esc)" className={CLASSE_DO_ICONE}>
            <X size={16} aria-hidden="true" />
          </button>
        </span>
      </header>

      <div ref={miolo} className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        {secoes.map((secao) => (
          <section key={secao} data-secao aria-labelledby={`${idDoTitulo}-${secao}`} className="border-b border-border-subtle py-4 last:border-b-0">
            <TituloDaSecao id={`${idDoTitulo}-${secao}`}>
              {secao === "detalhes" ? "Detalhes do negócio" : ROTULO_DA_SECAO[secao]}
            </TituloDaSecao>

            {secao === "detalhes" && (
              <>
                <ConteudoDaPrevia deal={deal} etapa={etapa} layout={layout} defs={defs} agora={agora} etapaEditavel={seletorDeEtapa} />
                {aberto && (etapaGanha || etapaPerdida) && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    {etapaGanha && (
                      <Button size="sm" disabled={!!movendo} onClick={() => mover(etapaGanha.id)} className="bg-inverse text-inverse-fg hover:bg-inverse/90">
                        <CheckCircle2 size={14} aria-hidden /> Ganho
                      </Button>
                    )}
                    {etapaPerdida && (
                      <Button variant="secondary" size="sm" disabled={!!movendo} onClick={() => mover(etapaPerdida.id)}>
                        <XCircle size={14} aria-hidden /> Perdido
                      </Button>
                    )}
                  </div>
                )}
                {!aberto && (
                  <Button variant="secondary" size="sm" className="mt-3 w-full" loading={movendo === "reabrir"} disabled={!!movendo} onClick={() => mover("", { reabrir: true })}>
                    <RotateCcw size={14} aria-hidden /> Reabrir negócio
                  </Button>
                )}
              </>
            )}

            {secao === "contato" && <ContatoPrincipal deal={deal} ficha={ficha.deal} />}

            {secao === "atividade" && (
              <Atividade
                // Nova chave por negócio e foco: a ação Nota de outro cartão abre a nota de novo.
                key={`${deal.id}-${foco ?? ""}`}
                dealId={deal.id}
                itens={ficha.linha.itens}
                falhou={ficha.linhaFalhou}
                carregando={ficha.estado === "carregando"}
                agora={ficha.agora}
                abrirNota={foco === "nota"}
                onMudou={async () => {
                  await ficha.carregar();
                  onMudou();
                }}
              />
            )}

            {secao === "tarefas" &&
              (ficha.deal ? (
                <TarefasDoNegocio
                  key={`${deal.id}-${foco ?? ""}`}
                  deal={ficha.deal}
                  agora={ficha.agora}
                  estreito
                  focar={foco === "tarefa"}
                  recarregar={async () => {
                    await ficha.carregar();
                    onMudou();
                  }}
                />
              ) : (
                <Carregando />
              ))}

            {secao === "produtos" && <Produtos dealId={deal.id} />}
          </section>
        ))}
      </div>
    </aside>,
    document.body
  );
}

const CLASSE_DO_ICONE = cn("grid size-8 place-items-center rounded-full text-text-tertiary transition-colors hover:bg-hover hover:text-text-primary", focusRing);

function TituloDaSecao({ id, children, acao }: { id: string; children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <div className="mb-2.5 flex items-center justify-between gap-2">
      <h3 id={id} className="text-small font-semibold text-text-primary">
        {children}
      </h3>
      {acao}
    </div>
  );
}

function Carregando() {
  return (
    <p className="inline-flex items-center gap-2 py-2 text-small text-text-tertiary">
      <Loader2 size={14} className="animate-spin" aria-hidden /> Carregando…
    </p>
  );
}

/** Contato principal: foto, nome, cargo e os atalhos de e-mail e WhatsApp. */
function ContatoPrincipal({ deal, ficha }: { deal: NegocioKanban; ficha: ReturnType<typeof useFicha>["deal"] }) {
  const doQuadro = deal.contacts[0];
  const completo = ficha?.contacts[0]?.contact;
  if (!doQuadro && !completo) return <p className="text-small text-text-tertiary">Nenhum contato ligado a este negócio.</p>;
  const nome = completo?.name || doQuadro?.name || "Contato sem nome";
  const email = completo?.email || doQuadro?.email;
  const id = completo?.id || doQuadro?.id;
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-border-subtle bg-panel px-3 py-2.5">
      <Avatar nome={nome} tamanho={40} />
      <Link href={`/contatos/${id}`} className="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-focus">
        <span className="block truncate text-small font-semibold text-text-primary hover:underline">{nome}</span>
        <span className="block truncate text-caption text-text-tertiary">{completo?.jobTitle || email || "—"}</span>
      </Link>
      <span className="flex shrink-0 gap-1">
        {email && (
          <a href={`mailto:${email}`} aria-label={`Enviar e-mail para ${nome}`} title="E-mail" className={cn(CLASSE_DO_ICONE, "border border-border-subtle")}>
            <Mail size={14} aria-hidden="true" />
          </a>
        )}
        {deal.whatsapp && (
          <Link href={`/conversas?c=${deal.whatsapp.conversationId}`} aria-label="Abrir conversa no WhatsApp" title="WhatsApp" className={cn(CLASSE_DO_ICONE, "border border-border-subtle")}>
            <LogoOficial marca="whatsapp" tamanho={14} />
          </Link>
        )}
      </span>
    </div>
  );
}

/** Atividade recente: a linha do tempo da ficha (com o histórico de alterações) e "Registrar atividade". */
function Atividade({
  dealId,
  itens,
  falhou,
  carregando,
  agora,
  abrirNota,
  onMudou,
}: {
  dealId: string;
  itens: ReturnType<typeof useFicha>["linha"]["itens"];
  falhou: boolean;
  carregando: boolean;
  agora: Date;
  abrirNota: boolean;
  onMudou: () => Promise<void>;
}) {
  const [nota, setNota] = React.useState(abrirNota);
  const caixa = React.useRef<HTMLDivElement>(null);
  // Aberto pela ação Nota do cartão: já com o cursor na nota.
  React.useEffect(() => {
    if (abrirNota) caixa.current?.querySelector("textarea")?.focus({ preventScroll: true });
  }, [abrirNota]);
  const recentes = itens.slice(0, 12);
  return (
    <div ref={caixa} className="flex flex-col gap-3">
      {nota ? (
        <NovaNota vinculo={{ dealId }} onCriada={onMudou} />
      ) : (
        <Button variant="secondary" size="sm" className="self-start" onClick={() => setNota(true)}>
          <Plus size={14} aria-hidden="true" /> Registrar atividade
        </Button>
      )}
      {carregando ? <Carregando /> : <LinhaDoTempoView itens={recentes} falhou={falhou} agora={agora} semFiltros />}
      {itens.length > recentes.length && (
        <Link href={`/negocios/${dealId}`} className="self-start text-small font-medium text-accent-fg hover:underline">
          Ver tudo na ficha
        </Link>
      )}
    </div>
  );
}

/** Produtos do negócio (itens), com o total de cada um. */
function Produtos({ dealId }: { dealId: string }) {
  const [itens, setItens] = React.useState<ItemDoNegocio[] | null>(null);
  React.useEffect(() => {
    let vivo = true;
    fetch(`/api/deals/${dealId}/items`)
      .then((r) => (r.ok ? r.json() : { itens: [] }))
      .then((d) => vivo && setItens(d.itens ?? []))
      .catch(() => vivo && setItens([]));
    return () => {
      vivo = false;
    };
  }, [dealId]);
  if (!itens) return <Carregando />;
  if (itens.length === 0) return <p className="text-small text-text-tertiary">Nenhum produto neste negócio.</p>;
  return (
    <ul className="flex flex-col divide-y divide-border-subtle">
      {itens.map((i) => (
        <li key={i.id} className="flex items-baseline justify-between gap-3 py-2 text-small">
          <span className="min-w-0 truncate text-text-primary">
            {i.name || "Produto"}
            <span className="text-text-tertiary"> × {i.quantity.toLocaleString("pt-BR")}</span>
          </span>
          <span className="shrink-0 tabular-nums font-medium text-text-primary">{dinheiro(i.totalCents)}</span>
        </li>
      ))}
    </ul>
  );
}
