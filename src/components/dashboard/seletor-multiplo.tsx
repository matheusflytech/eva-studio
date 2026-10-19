"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Peças de escolha do dashboard: um popover que não é cortado pelo modal
// (fica num portal, posicionado pelo botão), uma lista com busca e marcação
// múltipla, e os chips do que foi escolhido. Usado nos filtros do cartão e
// na barra de filtros do painel.
// ---------------------------------------------------------------------------

export interface OpcaoDeSelecao {
  id: string;
  label: string;
  /** Linha de contexto (funil da etapa, por exemplo). */
  detalhe?: string;
  /** Agrupa na lista (cabeçalho). */
  grupo?: string;
}

/** Popover preso a um botão. Fecha com Esc, clique fora e rolagem da página. */
export function Popover({
  aberto,
  aoFechar,
  ancora,
  largura = 280,
  children,
}: {
  aberto: boolean;
  aoFechar: () => void;
  ancora: React.RefObject<HTMLElement | null>;
  largura?: number;
  children: React.ReactNode;
}) {
  const caixa = React.useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = React.useState<{ top: number; left: number; acima: boolean } | null>(null);

  React.useLayoutEffect(() => {
    if (!aberto) return;
    const posicionar = () => {
      const r = ancora.current?.getBoundingClientRect();
      if (!r) return;
      const espacoAbaixo = window.innerHeight - r.bottom;
      const acima = espacoAbaixo < 300 && r.top > espacoAbaixo;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - largura - 8));
      setPos({ top: acima ? r.top - 6 : r.bottom + 6, left, acima });
    };
    posicionar();
    window.addEventListener("resize", posicionar);
    window.addEventListener("scroll", posicionar, true);
    return () => {
      window.removeEventListener("resize", posicionar);
      window.removeEventListener("scroll", posicionar, true);
    };
  }, [aberto, ancora, largura]);

  React.useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      const alvo = e.target as Node;
      if (caixa.current?.contains(alvo) || ancora.current?.contains(alvo)) return;
      aoFechar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        aoFechar();
      }
    };
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", tecla, true);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", tecla, true);
    };
  }, [aberto, aoFechar, ancora]);

  if (!aberto || !pos || typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={caixa}
      role="dialog"
      style={{ top: pos.top, left: pos.left, width: largura, transform: pos.acima ? "translateY(-100%)" : undefined }}
      className="glass-card glass-card-solid fixed z-[70] flex max-h-[340px] flex-col overflow-hidden rounded-2xl shadow-2xl ring-1 ring-border-default"
    >
      {children}
    </div>,
    document.body
  );
}

/** Lista com busca e marcação. `unica` = escolhe um e fecha. */
export function ListaDeOpcoes({
  opcoes,
  valores,
  aoMudar,
  unica = false,
  buscavel = true,
  vazio = "Nada por aqui ainda.",
}: {
  opcoes: OpcaoDeSelecao[];
  valores: string[];
  aoMudar: (v: string[]) => void;
  unica?: boolean;
  buscavel?: boolean;
  vazio?: string;
}) {
  const [busca, setBusca] = React.useState("");
  const termo = busca.trim().toLowerCase();
  const visiveis = termo ? opcoes.filter((o) => `${o.label} ${o.detalhe ?? ""} ${o.grupo ?? ""}`.toLowerCase().includes(termo)) : opcoes;
  const grupos = [...new Set(visiveis.map((o) => o.grupo ?? ""))];

  function alternar(id: string) {
    if (unica) return aoMudar([id]);
    aoMudar(valores.includes(id) ? valores.filter((v) => v !== id) : [...valores, id]);
  }

  return (
    <>
      {buscavel && opcoes.length > 6 && (
        <div className="flex items-center gap-2 border-b border-border-subtle px-3 py-2">
          <Search size={13} className="shrink-0 text-text-tertiary" />
          <input
            autoFocus
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar..."
            aria-label="Buscar opção"
            className="h-7 w-full bg-transparent text-[13px] text-text-primary outline-none placeholder:text-text-tertiary"
          />
        </div>
      )}
      <div className="flex-1 overflow-y-auto p-1.5" role="listbox" aria-multiselectable={!unica}>
        {visiveis.length === 0 && <p className="px-3 py-4 text-center text-[12px] text-text-tertiary">{termo ? `Nada com “${busca}”.` : vazio}</p>}
        {grupos.map((g) => (
          <div key={g || "_"}>
            {g && <p className="px-2.5 pb-1 pt-2 text-[10.5px] font-semibold uppercase tracking-wide text-text-tertiary">{g}</p>}
            {visiveis
              .filter((o) => (o.grupo ?? "") === g)
              .map((o) => {
                const marcado = valores.includes(o.id);
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="option"
                    aria-selected={marcado}
                    onClick={() => alternar(o.id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[13px] transition-colors hover:bg-surface-3",
                      marcado ? "text-text-primary" : "text-text-secondary"
                    )}
                  >
                    {!unica && (
                      <span
                        className={cn(
                          "flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border",
                          marcado ? "border-accent-500 bg-accent-500" : "border-border-strong"
                        )}
                      >
                        {marcado && <Check size={11} strokeWidth={3} className="text-white" />}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{o.label}</span>
                      {o.detalhe && <span className="block truncate text-[11px] text-text-tertiary">{o.detalhe}</span>}
                    </span>
                    {unica && marcado && <Check size={13} className="shrink-0 text-accent-400" />}
                  </button>
                );
              })}
          </div>
        ))}
      </div>
      {!unica && valores.length > 0 && (
        <div className="flex items-center justify-between border-t border-border-subtle px-3 py-2 text-[12px]">
          <span className="text-text-tertiary">{valores.length} escolhido(s)</span>
          <button type="button" onClick={() => aoMudar([])} className="text-accent-400 hover:underline">
            Limpar
          </button>
        </div>
      )}
    </>
  );
}

/**
 * Campo de múltipla escolha com chips. O botão mostra o que foi escolhido;
 * cada chip sai com um clique no X, sem abrir a lista.
 */
export function SeletorMultiplo({
  opcoes,
  valores,
  aoMudar,
  placeholder = "Escolha...",
  rotulo,
  compacto = false,
  className,
}: {
  opcoes: OpcaoDeSelecao[];
  valores: string[];
  aoMudar: (v: string[]) => void;
  placeholder?: string;
  /** Nome acessível do campo. */
  rotulo: string;
  compacto?: boolean;
  className?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const ancora = React.useRef<HTMLDivElement | null>(null);
  const porId = new Map(opcoes.map((o) => [o.id, o]));
  const fechar = React.useCallback(() => setAberto(false), []);

  return (
    <div ref={ancora} className={cn("relative", className)}>
      <div
        role="button"
        tabIndex={0}
        aria-label={rotulo}
        aria-haspopup="listbox"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
            e.preventDefault();
            setAberto(true);
          }
        }}
        className={cn(
          "flex w-full cursor-pointer flex-wrap items-center gap-1 rounded-xl border border-border-default bg-surface-2 py-1 pl-2 pr-8 text-left text-sm outline-none transition-colors",
          "hover:border-border-strong focus-visible:border-border-strong focus-visible:ring-2 focus-visible:ring-ice/20",
          compacto ? "min-h-9" : "min-h-11",
          aberto && "border-border-strong"
        )}
      >
        {valores.length === 0 && <span className="px-1.5 text-text-tertiary">{placeholder}</span>}
        {valores.map((v) => (
          <span key={v} className="inline-flex max-w-[180px] items-center gap-1 rounded-lg bg-accent-soft py-0.5 pl-2 pr-1 text-[12px] text-accent-300">
            <span className="truncate">{porId.get(v)?.label ?? "removido"}</span>
            <button
              type="button"
              aria-label={`Tirar ${porId.get(v)?.label ?? "item"}`}
              onClick={(e) => {
                e.stopPropagation();
                aoMudar(valores.filter((x) => x !== v));
              }}
              className="rounded p-0.5 text-accent-300/80 hover:bg-accent-500/20 hover:text-accent-200"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
      </div>
      <Popover aberto={aberto} aoFechar={fechar} ancora={ancora}>
        <ListaDeOpcoes opcoes={opcoes} valores={valores} aoMudar={aoMudar} />
      </Popover>
    </div>
  );
}
