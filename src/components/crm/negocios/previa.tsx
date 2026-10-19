"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CheckCircle2, Loader2, Maximize2, MessageCircle, X, XCircle } from "lucide-react";
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
  const ctx = { tipoDaEtapa: etapa.type, agora, defs };
  const rotulos = rotulosPersonalizados(defs);
  // O título da prévia é sempre o nome do negócio; quem compra vem embaixo.
  const { titulo: quem } = tituloDoCartao(deal, ["empresa"]);
  const linhas = layout.previa.filter((c) => c !== "proximoPasso");
  const temProximo = layout.previa.includes("proximoPasso") || layout.campos.includes("proximoPasso");
  const aberto = etapa.type === "open";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px] font-medium", cor.fundo, cor.texto)}>
          <span className={cn("h-1.5 w-1.5 rounded-full", cor.ponto)} aria-hidden />
          {etapa.name}
        </span>
        <h2 id={idDoTitulo} className="mt-2 font-display text-[17px] font-semibold leading-snug text-text-primary">
          {comLink ? (
            <Link
              href={`/negocios/${deal.id}`}
              className="rounded-sm underline-offset-2 outline-none hover:text-accent-400 hover:underline focus-visible:ring-2 focus-visible:ring-accent-500/60"
            >
              {deal.name}
            </Link>
          ) : (
            deal.name
          )}
        </h2>
        {quem !== deal.name && <p className="mt-0.5 truncate text-[12.5px] text-text-secondary">{quem}</p>}
        <p className="mt-3 flex items-baseline gap-2">
          <span className="font-display text-[22px] font-semibold tracking-[-0.01em] tabular-nums text-text-primary">
            {deal.amountCents > 0 ? dinheiro(deal.amountCents) : <span className="font-sans text-[14px] font-normal text-text-tertiary">Sem valor</span>}
          </span>
          {aberto && <span className="text-[12px] tabular-nums text-text-tertiary">{deal.probability}% de chance</span>}
        </p>
      </div>

      {temProximo && (
        <section aria-label="Próximo passo" className="rounded-xl border border-border-subtle bg-surface-2/60 px-3 py-2.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Próximo passo</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[12px]">
            <SinalDoProximoPasso deal={deal} tipoDaEtapa={etapa.type} agora={agora} />
            {deal.nextTask?.text && <span className="min-w-0 truncate text-text-secondary">{deal.nextTask.text}</span>}
            {!deal.nextTask && aberto && <span className="text-text-tertiary">Nenhuma tarefa em aberto.</span>}
            {deal.openTasks > 1 && <span className="text-[11.5px] tabular-nums text-text-tertiary">{deal.openTasks} tarefas abertas</span>}
          </div>
        </section>
      )}

      {linhas.length > 0 && (
        <dl className="flex flex-col divide-y divide-border-subtle">
          {linhas.map((campo) => {
            const texto = textoDoCampo(campo, deal, ctx);
            return (
              <div key={campo} className="flex items-baseline justify-between gap-4 py-2 text-[13px]">
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
}) {
  const painel = React.useRef<HTMLElement>(null);
  const devolverFoco = React.useRef(true);
  const [movendo, setMovendo] = React.useState<string | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
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

  async function mover(stageId: string) {
    if (!stageId || stageId === etapa.id) return;
    setMovendo(stageId);
    setErro(null);
    const res = await fetch(`/api/deals/${deal.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stageId }),
    }).catch(() => null);
    setMovendo(null);
    if (!res?.ok) {
      const d = await res?.json().catch(() => ({}));
      setErro((d as { error?: string } | undefined)?.error ?? "Não foi possível mover o negócio.");
      return;
    }
    onMudou();
  }

  const aberto = etapa.type === "open";

  return createPortal(
    <aside
      ref={painel}
      role="dialog"
      aria-modal="false"
      aria-labelledby={idDoTitulo}
      tabIndex={-1}
      className="fixed bottom-3 right-3 top-3 z-50 flex w-[380px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-2xl border border-border-default bg-surface-1 shadow-[0_24px_64px_rgba(0,0,0,0.55)] outline-none"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border-subtle px-4 py-2.5">
        <span className="text-[11.5px] font-medium uppercase tracking-wide text-text-tertiary">Prévia do negócio</span>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar prévia"
          title="Fechar (Esc)"
          className="grid h-7 w-7 place-items-center rounded-md text-text-tertiary outline-none hover:bg-surface-3 hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60"
        >
          <X size={15} aria-hidden />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <ConteudoDaPrevia deal={deal} etapa={etapa} layout={layout} defs={defs} agora={agora} idDoTitulo={idDoTitulo} comLink />

        <div className="mt-5 flex flex-wrap gap-2">
          <Link
            href={`/negocios/${deal.id}`}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent-500 px-3 text-[13px] font-medium text-white outline-none transition-colors hover:bg-accent-400 focus-visible:ring-2 focus-visible:ring-accent-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base"
          >
            <Maximize2 size={13} aria-hidden /> Abrir ficha completa
          </Link>
          {deal.whatsapp && (
            <Link
              href={`/conversas?c=${deal.whatsapp.conversationId}`}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-border-default bg-surface-2 px-3 text-[13px] font-medium text-text-primary outline-none transition-colors hover:border-border-strong hover:bg-surface-3 focus-visible:ring-2 focus-visible:ring-accent-500/60"
            >
              <span className="relative inline-flex text-[#25d366]">
                <MessageCircle size={14} aria-hidden />
                {deal.whatsapp.naoLida && (
                  <span className="absolute -right-0.5 -top-0.5 h-[7px] w-[7px] rounded-full border-2 border-surface-2 bg-[#25d366]" />
                )}
              </span>
              WhatsApp
              {deal.whatsapp.naoLida && <span className="sr-only">(mensagem não lida)</span>}
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-border-subtle bg-surface-1 px-4 py-3">
        <div className="flex items-center gap-2">
          <label htmlFor={`${idDoTitulo}-etapa`} className="shrink-0 text-[12px] text-text-tertiary">
            Etapa
          </label>
          <Select
            id={`${idDoTitulo}-etapa`}
            value={etapa.id}
            disabled={!!movendo}
            onChange={(e) => mover(e.target.value)}
            className="h-8 flex-1 text-[13px]"
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
                className="text-emerald-400 hover:text-emerald-300"
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
        {erro && (
          <p role="alert" className="text-[12px] text-danger">
            {erro}
          </p>
        )}
      </div>
    </aside>,
    document.body
  );
}
