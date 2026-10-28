"use client";

import * as React from "react";
import { CalendarClock, CheckCircle2, MessageCircle, Phone, TrendingUp, X } from "lucide-react";
import { LogoOficial } from "@/components/ui/logo-oficial";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { focusRing } from "@/components/ui/styles";
import Link from "@/components/contrato/link";
import type { AcaoDaAtencao, Acontecimento, ItemDeAtencao } from "./eva-voz";

/**
 * Blocos da "voz da Eva" na tela de Negócios (estilos Eva · 1/2/3): momentos, "desde ontem / pede sua atenção" e a comemoração quando
 * um negócio fecha. Tudo no design system: painel neutro, sem borda colorida,
 * sem brilho, cor só em ícone de status.
 */

/** Momentos que valem comemorar: uma linha de texto, sem pílulas. */
export function Momentos({ itens }: { itens: string[] }) {
  if (itens.length === 0) return null;
  return (
    <ul aria-label="Momentos" className="flex shrink-0 flex-wrap gap-x-5 gap-y-1 text-small text-text-secondary">
      {itens.map((m) => (
        <li key={m} className="inline-flex items-center gap-1.5">
          <TrendingUp size={14} aria-hidden="true" className="text-success" />
          {m}
        </li>
      ))}
    </ul>
  );
}

export type EstiloDaTela = "classico" | "v1" | "v2" | "v3";

/**
 * Liga a voz humana do quadro (variação 2) sem passar prop por cartão:
 * cartão, coluna e sinal leem daqui.
 */
export const VozDoQuadro = React.createContext(false);

/** Troca de estilo enquanto comparamos as variações. Sai quando uma for escolhida. */
export function SeletorDeEstilo({ estilo, onMudar }: { estilo: EstiloDaTela; onMudar: (e: EstiloDaTela) => void }) {
  return (
    <SegmentedControl
      label="Estilo da tela"
      value={estilo}
      onChange={onMudar}
      options={[
        { value: "classico", label: "Atual" },
        { value: "v1", label: "Eva · 1" },
        { value: "v2", label: "Eva · 2" },
        { value: "v3", label: "Eva · 3" },
      ]}
    />
  );
}

/** Aviso curto quando um negócio fecha: some sozinho e não rouba o foco. */
export function Comemoracao({ titulo, detalhe, onFim }: { titulo: string; detalhe: string; onFim: () => void }) {
  React.useEffect(() => {
    const t = window.setTimeout(onFim, 5200);
    return () => window.clearTimeout(t);
  }, [onFim]);
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 flex max-w-sm items-center gap-3 rounded-lg border border-border-default bg-overlay px-4 py-3 shadow-overlay"
    >
      <CheckCircle2 size={20} aria-hidden="true" className="shrink-0 text-success" />
      <div className="min-w-0">
        <p className="truncate text-body font-semibold text-text-primary">{titulo}</p>
        <p className="text-small text-text-secondary">{detalhe}</p>
      </div>
      <IconButton aria-label="Fechar aviso" size="sm" onClick={onFim}>
        <X />
      </IconButton>
    </div>
  );
}

const ICONE_DA_ACAO: Record<AcaoDaAtencao, typeof Phone> = {
  whatsapp: MessageCircle,
  retorno: Phone,
  remarcar: CalendarClock,
  ligar: Phone,
};

/**
 * Variação 3: o dia em duas colunas. À esquerda o que mudou desde ontem; à
 * direita o que pede ação hoje, cada um com o botão certo.
 */
export function DiaDeHoje({
  acontecimentos,
  atencao,
  total,
  onAcao,
  onVerTodos,
  empilhado = false,
}: {
  acontecimentos: Acontecimento[];
  atencao: ItemDeAtencao[];
  total: number;
  onAcao: (item: ItemDeAtencao) => void;
  onVerTodos: () => void;
  /** Uma coluna só (dentro da gaveta "Seu dia" do quadro). */
  empilhado?: boolean;
}) {
  if (acontecimentos.length === 0 && atencao.length === 0) return null;
  return (
    <section aria-label="Seu dia" className={cn("grid shrink-0 gap-3", !empilhado && "lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]")}>
      <div className="rounded-[18px] border border-border-subtle bg-panel">
        <h2 className="flex h-10 items-center border-b border-border-subtle px-4 text-body font-semibold text-text-primary">Desde ontem</h2>
        {acontecimentos.length === 0 ? (
          <p className="px-4 py-3 text-small text-text-tertiary">Tudo quieto nas últimas horas.</p>
        ) : (
          <ol className="px-4">
            {acontecimentos.map((a) => (
              <li key={a.id} className="flex gap-3 border-t border-border-subtle py-2 first:border-t-0">
                <span className="w-12 shrink-0 font-mono text-caption tabular-nums text-text-tertiary">{a.quando}</span>
                <span className="min-w-0 text-small text-text-secondary">
                  {a.partes.map((p, i) =>
                    p.forte ? (
                      <strong key={i} className={cn("font-medium", p.tom === "ok" ? "text-success" : "text-text-primary")}>
                        {p.texto}
                      </strong>
                    ) : (
                      <React.Fragment key={i}>{p.texto}</React.Fragment>
                    )
                  )}
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="rounded-[18px] border border-border-subtle bg-panel">
        <div className="flex h-10 items-center justify-between gap-3 border-b border-border-subtle px-4">
          <h2 className="text-body font-semibold text-text-primary">Pede sua atenção hoje</h2>
          {total > atencao.length && (
            <button type="button" onClick={onVerTodos} className={cn("rounded-sm text-small text-accent-fg hover:underline", focusRing)}>
              Ver os {total}
            </button>
          )}
        </div>
        {atencao.length === 0 ? (
          <p className="px-4 py-3 text-small text-text-tertiary">Nada pedindo você agora. Bom momento para prospectar.</p>
        ) : (
          <ul>
            {atencao.map((item) => {
              const Icone = ICONE_DA_ACAO[item.acao];
              const titulo = item.deal.company?.name || item.deal.contacts[0]?.name || item.deal.name;
              return (
                <li key={item.deal.id} className="flex items-center gap-3 border-t border-border-subtle px-4 py-2 first:border-t-0">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/deals/${item.deal.id}`}
                      className={cn("block truncate rounded-sm text-small font-medium text-text-primary hover:text-accent-fg hover:underline", focusRing)}
                    >
                      {item.deal.name.startsWith(titulo) ? (
                        // Nome do negócio já começa pela empresa ("Grupo X · Piloto"): mostra só ele.
                        item.deal.name
                      ) : (
                        <>
                          {titulo}
                          {titulo !== item.deal.name && <span className="font-normal text-text-tertiary"> · {item.deal.name}</span>}
                        </>
                      )}
                    </Link>
                    <p className="truncate text-caption text-text-secondary">{item.motivo}</p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => onAcao(item)}>
                    {item.acao === "whatsapp" ? (
                      <LogoOficial marca="whatsapp" tamanho={14} />
                    ) : (
                      <Icone size={14} aria-hidden="true" className={item.acao === "retorno" ? "text-danger" : "text-text-tertiary"} />
                    )}
                    {item.rotulo}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
