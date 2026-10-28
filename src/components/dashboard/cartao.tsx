"use client";

import * as React from "react";
import { Copy, Download, FilterX, GripHorizontal, MoreHorizontal, MoveDiagonal2, Pencil, Sparkle, X } from "lucide-react";
import Link from "@/components/contrato/link";
import { useRouter } from "@/lib/contrato/navegacao";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";
import { acabouDeArrastar } from "./arrastar-cartoes";

// ---------------------------------------------------------------------------
// A moldura de todo cartão do Dashboard: título pequeno, conteúdo, selo de
// filtro. Para quem pode editar, no hover (ou no foco) aparecem a alça de
// arrastar no topo, o canto de redimensionar e o menu ⋯. Não existe modo de
// edição: mexe direto e salva sozinho.
// ---------------------------------------------------------------------------

// Classes fixas (não montadas por string) para o Tailwind achar.
const LARGURA: Record<number, string> = {
  1: "dash-estreito",
  2: "md:col-span-2 dash-largo",
  3: "md:col-span-2 xl:col-span-3 dash-largo",
  4: "md:col-span-2 xl:col-span-4 dash-largo",
};
const ALTURA: Record<number, string> = { 1: "", 2: "md:row-span-2", 3: "md:row-span-3" };

export function Cartao({
  id, titulo, explicacao, largura, altura, destaque, indice, podeEditar, arrastando, href, aoAbrir, selo, erro,
  visuais, aoRenomear, aoDuplicar, aoDestaque, aoRemover, aoBaixarCsv, aoArrastar, aoRedimensionar, aoTeclado, children,
}: {
  id: string;
  titulo: string;
  explicacao?: string;
  largura: number;
  altura: number;
  destaque: boolean;
  /** Posição na grade, para a entrada em cascata. */
  indice: number;
  podeEditar: boolean;
  arrastando: boolean;
  /** Detalhe do cartão (negócios ganhos, conversas...). */
  href?: string;
  /** Alternativa ao href: abre algo na própria tela (o construtor). */
  aoAbrir?: () => void;
  selo?: string | null;
  erro?: string | null;
  /** Itens do menu ⋯ para trocar o visual (vêm da página, que conhece a fonte). */
  visuais?: React.ReactNode;
  aoRenomear: (titulo: string) => void;
  aoDuplicar: () => void;
  aoDestaque: () => void;
  aoRemover: () => void;
  aoBaixarCsv: () => void;
  aoArrastar: (e: React.PointerEvent) => void;
  aoRedimensionar: (e: React.PointerEvent) => void;
  aoTeclado: (e: React.KeyboardEvent) => void;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [renomeando, setRenomeando] = React.useState(false);
  const clicavel = !!href || !!aoAbrir;

  // Clique em qualquer lugar do cartão abre o detalhe, menos nos controles.
  function clicar(e: React.MouseEvent) {
    if (!clicavel || renomeando || acabouDeArrastar()) return;
    const alvo = e.target as HTMLElement;
    if (alvo.closest("button, a, input, select, [role='menu'], [role='radiogroup']")) return;
    if (window.getSelection()?.toString()) return;
    if (href) router.push(href);
    else aoAbrir?.();
  }

  const tituloVisivel = renomeando ? (
    <input
      autoFocus
      defaultValue={titulo}
      aria-label="Nome do cartão"
      maxLength={80}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = titulo;
          e.currentTarget.blur();
        }
      }}
      onBlur={(e) => {
        const novo = e.currentTarget.value.trim();
        if (novo && novo !== titulo) aoRenomear(novo);
        setRenomeando(false);
      }}
      className="w-full min-w-0 rounded-md bg-transparent text-small outline outline-1 outline-border-default"
    />
  ) : href ? (
    <Link href={href} className="truncate hover:underline focus-visible:underline" title={explicacao}>
      {titulo}
    </Link>
  ) : aoAbrir ? (
    <button type="button" onClick={aoAbrir} className="truncate text-left hover:underline focus-visible:underline" title={explicacao}>
      {titulo}
    </button>
  ) : (
    <span className="truncate" title={explicacao}>
      {titulo}
    </span>
  );

  return (
    <div
      data-cartao={id}
      onClick={clicar}
      style={{ animationDelay: `${Math.min(indice, 16) * 40}ms` }}
      className={cn(
        "group/cartao relative flex min-h-[168px] min-w-0 flex-col overflow-hidden rounded-[22px] p-5 md:min-h-0",
        "animate-[ds-pop-in_var(--dur-slow)_var(--ease-out)_both] motion-reduce:animate-none print:animate-none",
        LARGURA[largura] ?? LARGURA[1],
        ALTURA[altura] ?? "",
        destaque ? "bg-inverse text-inverse-fg" : "border border-border-subtle bg-panel text-text-primary",
        clicavel && "cursor-pointer",
        clicavel && !destaque && "transition-colors hover:border-border-default",
        arrastando && "z-20 opacity-80 shadow-overlay"
      )}
    >
      {podeEditar && (
        <>
          <button
            type="button"
            aria-label={`Mover o cartão ${titulo}. Setas mudam a posição; Shift com setas muda o tamanho.`}
            title="Arraste para mudar a ordem"
            data-alca
            onPointerDown={aoArrastar}
            onKeyDown={aoTeclado}
            className={cn(
              "absolute left-1/2 top-1 z-10 grid h-5 w-12 -translate-x-1/2 cursor-grab touch-none place-items-center rounded-full opacity-0 transition-opacity active:cursor-grabbing print:hidden",
              "focus-visible:opacity-100 group-hover/cartao:opacity-100",
              arrastando && "opacity-100",
              destaque ? "text-inverse-fg/70 hover:bg-inverse-fg/10" : "text-text-tertiary hover:bg-hover hover:text-text-primary"
            )}
          >
            <GripHorizontal size={14} aria-hidden="true" />
          </button>
          <span
            aria-hidden="true"
            title="Puxe para mudar o tamanho"
            onPointerDown={aoRedimensionar}
            className={cn(
              "absolute bottom-1 right-1 z-10 hidden size-6 cursor-nwse-resize touch-none place-items-center rounded-md opacity-0 transition-opacity md:grid print:hidden",
              "group-hover/cartao:opacity-100",
              arrastando && "opacity-100",
              destaque ? "text-inverse-fg/70 hover:bg-inverse-fg/10" : "text-text-tertiary hover:bg-hover hover:text-text-primary"
            )}
          >
            <MoveDiagonal2 size={13} />
          </span>
        </>
      )}

      <div className="flex min-w-0 items-center gap-2">
        <h2 className={cn("flex min-w-0 flex-1 text-small", destaque ? "opacity-80" : "text-text-secondary print:text-text-primary")}>
          {tituloVisivel}
        </h2>
        <div className={cn("-my-1 -mr-2 shrink-0 print:hidden", podeEditar && "opacity-0 transition-opacity focus-within:opacity-100 group-hover/cartao:opacity-100 has-[[data-state=open]]:opacity-100")}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton aria-label={`Opções do cartão ${titulo}`} size="sm" className={destaque ? "text-inverse-fg/80 hover:bg-inverse-fg/10 hover:text-inverse-fg" : undefined}>
                <MoreHorizontal />
              </IconButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {podeEditar && visuais}
              {podeEditar && (
                <>
                  <DropdownMenuItem onSelect={() => setRenomeando(true)}>
                    <Pencil aria-hidden="true" /> Renomear
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={aoDuplicar}>
                    <Copy aria-hidden="true" /> Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={aoDestaque}>
                    <Sparkle aria-hidden="true" /> {destaque ? "Tirar o destaque" : "Destacar"}
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuItem onSelect={aoBaixarCsv}>
                <Download aria-hidden="true" /> Baixar CSV
              </DropdownMenuItem>
              {podeEditar && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={aoRemover} className="text-danger focus:text-danger">
                    <X aria-hidden="true" /> Remover
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-3 flex min-h-0 flex-1 flex-col">
        {erro ? <p role="alert" className="rounded-[14px] bg-danger-subtle px-3 py-2.5 text-small text-danger">{erro}</p> : children}
      </div>

      {selo && (
        <p className={cn("mt-2 inline-flex w-fit shrink-0 items-center gap-1 text-caption", destaque ? "opacity-70" : "text-text-tertiary")}>
          <FilterX size={11} aria-hidden="true" /> {selo}
        </p>
      )}
    </div>
  );
}

/** Espaço tracejado do fim da grade. */
export function AdicionarCartao({ aoClicar }: { aoClicar: () => void }) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      className="flex min-h-[168px] flex-col items-center justify-center gap-2 rounded-[22px] border border-dashed border-border-default text-text-tertiary transition-colors hover:border-accent-solid/50 hover:text-accent-fg md:min-h-0 print:hidden"
    >
      <span className="text-[20px] leading-none" aria-hidden="true">+</span>
      <span className="text-small font-medium">Adicionar cartão</span>
    </button>
  );
}
