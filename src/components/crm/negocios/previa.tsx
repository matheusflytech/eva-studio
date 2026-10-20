"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "@/components/contrato/link";
import { CheckCircle2, Loader2, Maximize2, MessageCircle, RotateCcw, X, XCircle } from "lucide-react";
import type { PedidoDeMudanca, ResultadoDaTentativa } from "./mudanca-de-etapa";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { corDaEtapa, type DefinicaoDeCampo } from "@/lib/custom-fields";
import { rotuloDoCampo, type LayoutDoCartao } from "@/lib/cartao-layout";
import { SinalDoProximoPasso } from "./deal-card";
import { rotulosPersonalizados, textoDoCampo, tituloDoCartao } from "./cartao";
import { dinheiro, type NegocioKanban } from "./modelo";

export interface EtapaDaPrevia {
  id: string;
  name: string;
  type: string;
  color: string;
  /** Regra da etapa: prazo de parado (null = nunca) e orientação. */
  rottingDays?: number | null;
  guidance?: string;
}

/**
 * Miolo da prévia: quem é, etapa, valor, próximo passo e os campos que o
 * funil escolheu mostrar. Também é a prévia ao vivo da tela de configuração.
 */
export function ConteudoDaPrevia({
  deal,
  etapa,
  layout,
  defs,
  agora,
  idDoTitulo,
  comLink = false,
}: {
  deal: NegocioKanban;
  etapa: EtapaDaPrevia;
  layout: LayoutDoCartao;
  defs: DefinicaoDeCampo[];
  agora: Date;
  idDoTitulo?: string;
  comLink?: boolean;
}) {
  const cor = corDaEtapa(etapa.color, etapa.type);
  const ctx = { tipoDaEtapa: etapa.type, agora, defs, prazoParado: etapa.rottingDays };
  const rotulos = rotulosPersonalizados(defs);
  // O título da prévia é sempre o nome do negócio; quem compra vem embaixo.
  const { titulo: quem } = tituloDoCartao(deal, ["empresa"]);
  const linhas = layout.previa.filter((c) => c !== "proximoPasso");
  const temProximo = layout.previa.includes("proximoPasso") || layout.campos.includes("proximoPasso");
  const aberto = etapa.type === "open";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className={cn("inline-flex items-center gap-1.5 rounded-sm px-1.5 py-0.5 text-caption font-medium", cor.fundo, cor.texto)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", cor.ponto)} aria-hidden />
          {etapa.name}
        </span>
        <h2 id={idDoTitulo} className="mt-2 text-title-sm text-text-primary">
          {comLink ? (
            <Link
              href={`/negocios/${deal.id}`}
              className="rounded-sm underline-offset-2 hover:text-accent-fg hover:underline"
            >
              {deal.name}
            </Link>
          ) : (
            deal.name
          )}
        </h2>
        {quem !== deal.name && <p className="mt-0.5 truncate text-small text-text-secondary">{quem}</p>}
        {etapa.guidance && aberto && (
          <p className="mt-2 whitespace-pre-line text-caption text-text-secondary">
            <span className="font-medium text-text-primary">Nesta etapa: </span>
            {etapa.guidance}
          </p>
        )}
        <p className="mt-3 flex items-baseline gap-2">
          <span className="text-title tabular-nums text-text-primary">
            {deal.amountCents > 0 ? dinheiro(deal.amountCents) : <span className="text-body font-normal text-text-tertiary">Sem valor</span>}
          </span>
          {aberto && <span className="text-caption tabular-nums text-text-tertiary">{deal.probability}% de chance</span>}
        </p>
      </div>

      {temProximo && (
        <section aria-label="Próximo passo" className="rounded-md border border-border-subtle bg-raised px-3 py-2.5">
          <p className="text-caption font-medium text-text-tertiary">Próximo passo</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-caption">
            <SinalDoProximoPasso deal={deal} tipoDaEtapa={etapa.type} agora={agora} prazoParado={etapa.rottingDays} />
            {deal.nextTask?.text && <span className="min-w-0 truncate text-text-secondary">{deal.nextTask.text}</span>}
            {!deal.nextTask && aberto && <span className="text-text-tertiary">Nenhuma tarefa em aberto.</span>}
            {deal.openTasks > 1 && <span className="text-caption tabular-nums text-text-tertiary">{deal.openTasks} tarefas abertas</span>}
          </div>
        </section>
      )}

      {linhas.length > 0 && (
        <dl className="flex flex-col divide-y divide-border-subtle">
          {linhas.map((campo) => {
            const texto = textoDoCampo(campo, deal, ctx);
            return (
              <div key={campo} className="flex items-baseline justify-between gap-4 py-2 text-small">
                <dt className="shrink-0 text-text-tertiary">{rotuloDoCampo(campo, rotulos)}</dt>
                <dd className={cn("min-w-0 break-words text-right", texto ? "text-text-primary" : "text-text-tertiary")}>{texto || "—"}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </div>
  );
}

/**
 * Prévia leve ao clicar no cartão (ou na linha da lista): um painel lateral
 * sem fundo escuro, para olhar e agir sem perder o quadro de vista. Esc ou
 * clique fora fecha; o foco volta ao cartão.
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
}) {
  const painel = React.useRef<HTMLElement>(null);
  const devolverFoco = React.useRef(true);
  const [movendo, setMovendo] = React.useState<string | null>(null);
  const idDoTitulo = React.useId();
  const fechar = React.useRef(onFechar);
  React.useEffect(() => {
    fechar.current = onFechar;
  });

  const etapaGanha = etapas.find((s) => s.type === "won");
  const etapaPerdida = etapas.find((s) => s.type === "lost");
  const dealId = deal.id;

  React.useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const el = painel.current;
    el?.focus({ preventScroll: true });
    if (el && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.animate(
        [
          { opacity: 0, transform: "translateX(10px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 160, easing: "cubic-bezier(0.2, 0, 0, 1)" }
      );
    }

    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) {
        e.preventDefault();
        fechar.current();
      }
    };
    // Clique fora fecha sem devolver o foco: quem clicou já escolheu outro lugar.
    const aoApontar = (e: PointerEvent) => {
      if (painel.current && e.target instanceof Node && !painel.current.contains(e.target)) {
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
      if (!flag.current) return;
      // O cartão pode ter mudado de coluna (e de elemento) enquanto a prévia estava aberta.
      const cartao = document.querySelector<HTMLElement>(`[data-deal-id="${CSS.escape(dealId)}"]`) ?? anterior;
      cartao?.focus({ preventScroll: true });
    };
  }, [dealId]);

  async function mover(stageId: string, extra?: Record<string, unknown>) {
    const para = etapas.find((s) => s.id === stageId);
    if (!extra?.reabrir && (!para || stageId === etapa.id)) return;
    setMovendo(stageId || "reabrir");
    // Regras da etapa: os modais (motivo da perda, "Complete para mover") e o
    // aviso de erro são da tela que abriu a prévia; aqui só o resultado.
    const r = await onMover({
      dealId: deal.id,
      nome: deal.name,
      pipelineId,
      para: para ?? { id: "", name: "", type: "open" },
      defs,
      extra,
    });
    setMovendo(null);
    if (r === "movido") onMudou();
  }

  const aberto = etapa.type === "open";

  return createPortal(
    <aside
      ref={painel}
      role="dialog"
      aria-modal="false"
      aria-labelledby={idDoTitulo}
      tabIndex={-1}
      className="fixed bottom-3 right-3 top-3 z-50 flex w-[380px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-lg border border-border-default bg-overlay shadow-overlay outline-none"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-2.5">
        <span className="text-caption font-medium text-text-tertiary">Prévia do negócio</span>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar prévia"
          title="Fechar (Esc)"
          className="grid h-7 w-7 place-items-center rounded-md text-text-tertiary hover:bg-hover hover:text-text-primary"
        >
          <X size={15} aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <ConteudoDaPrevia deal={deal} etapa={etapa} layout={layout} defs={defs} agora={agora} idDoTitulo={idDoTitulo} comLink />

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={`/negocios/${deal.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent-solid px-3 text-body font-medium text-text-on-accent transition-colors hover:bg-accent-solid-hover"
          >
            <Maximize2 size={13} aria-hidden /> Abrir ficha completa
          </Link>
          {deal.whatsapp && (
            <Link
              href={`/conversas?c=${deal.whatsapp.conversationId}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-default bg-panel px-3 text-body font-medium text-text-primary transition-colors hover:border-border-strong hover:bg-raised"
            >
              <span className="relative inline-flex text-success">
                <MessageCircle size={14} aria-hidden />
                {deal.whatsapp.naoLida && (
                  <span className="absolute -right-0.5 -top-0.5 h-[7px] w-[7px] rounded-full border-2 border-panel bg-success" />
                )}
              </span>
              WhatsApp
              {deal.whatsapp.naoLida && <span className="sr-only">(mensagem não lida)</span>}
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-border-subtle bg-overlay px-4 py-3">
        <div className="flex items-center gap-2">
          <label htmlFor={`${idDoTitulo}-etapa`} className="shrink-0 text-caption text-text-tertiary">
            Etapa
          </label>
          <Select
            id={`${idDoTitulo}-etapa`}
            value={etapa.id}
            // Ganho/perdido só sai com "Reabrir".
            disabled={!!movendo || !aberto}
            onChange={(e) => mover(e.target.value)}
            className="h-8 flex-1"
          >
            {etapas.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          {movendo && <Loader2 size={14} className="shrink-0 animate-spin text-text-tertiary" aria-label="Movendo" />}
        </div>
        {aberto && (etapaGanha || etapaPerdida) && (
          <div className="grid grid-cols-2 gap-2">
            {etapaGanha && (
              <Button
                variant="secondary"
                size="sm"
                disabled={!!movendo}
                onClick={() => mover(etapaGanha.id)}
                className="text-success"
              >
                <CheckCircle2 size={14} aria-hidden /> Ganho
              </Button>
            )}
            {etapaPerdida && (
              <Button variant="danger" size="sm" disabled={!!movendo} onClick={() => mover(etapaPerdida.id)}>
                <XCircle size={14} aria-hidden /> Perdido
              </Button>
            )}
          </div>
        )}
        {!aberto && (
          <Button variant="secondary" size="sm" loading={movendo === "reabrir"} disabled={!!movendo} onClick={() => mover("", { reabrir: true })}>
            <RotateCcw size={14} aria-hidden /> Reabrir negócio
          </Button>
        )}
      </div>
    </aside>,
    document.body
  );
}
