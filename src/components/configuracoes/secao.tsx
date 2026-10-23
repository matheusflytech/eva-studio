import * as React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Peças das telas de configuração (v5, no jeito "settings" do Untitled UI):
// cabeçalho da seção, linhas "rótulo + descrição | campo" separadas por linha
// fina, rodapé com Cancelar/Salvar e lista colada com linhas finas. Sem
// cartão em volta do formulário. Usadas em Configurações e em Integrações.
// ---------------------------------------------------------------------------

/** Cabeçalho da seção: título, uma frase e, à direita, a ação da seção. */
export function CabecalhoDaSecao({
  titulo,
  descricao,
  acoes,
  nivel = 1,
  className,
}: {
  titulo: React.ReactNode;
  descricao?: React.ReactNode;
  acoes?: React.ReactNode;
  /** 1 = título da tela (h1); 2 = subseção (h2, menor). */
  nivel?: 1 | 2;
  className?: string;
}) {
  const Titulo = nivel === 1 ? "h1" : "h2";
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3", nivel === 1 ? "pb-5" : "pb-3", className)}>
      <div className="min-w-0 max-w-2xl">
        <Titulo
          className={cn(
            "font-semibold tracking-tight text-text-primary",
            nivel === 1 ? "text-heading" : "text-title-sm"
          )}
        >
          {titulo}
        </Titulo>
        {descricao && <p className="mt-0.5 text-small text-text-tertiary">{descricao}</p>}
      </div>
      {acoes && <div className="flex shrink-0 flex-wrap items-center gap-2">{acoes}</div>}
    </div>
  );
}

/** Uma linha: rótulo e explicação à esquerda, o controle à direita. */
export function LinhaDeConfig({
  rotulo,
  descricao,
  htmlFor,
  children,
  className,
}: {
  rotulo: React.ReactNode;
  descricao?: React.ReactNode;
  /** id do campo, para o rótulo virar <label>. */
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const Rotulo = htmlFor ? "label" : "p";
  return (
    <div
      className={cn(
        "grid gap-x-8 gap-y-2.5 border-t border-border-subtle py-5 md:grid-cols-[minmax(0,220px)_minmax(0,1fr)]",
        className
      )}
    >
      <div className="min-w-0">
        <Rotulo {...(htmlFor ? { htmlFor } : {})} className="block text-body font-semibold text-text-primary">
          {rotulo}
        </Rotulo>
        {descricao && <p className="mt-0.5 text-small text-text-tertiary">{descricao}</p>}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Rodapé da seção: mensagem à esquerda, Cancelar/Salvar à direita. */
export function RodapeDaSecao({ children, mensagem }: { children: React.ReactNode; mensagem?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle pt-4">
      {mensagem && <span className="mr-auto text-small text-text-tertiary">{mensagem}</span>}
      {children}
    </div>
  );
}

/** Rótulo de grupo pequeno, em mono (ex.: "Chaves, na ordem em que respondem   4"). */
export function RotuloDeGrupo({ children, contagem, acoes }: { children: React.ReactNode; contagem?: React.ReactNode; acoes?: React.ReactNode }) {
  return (
    <div className="flex min-h-7 items-center gap-2 px-1 pb-2">
      <span className="font-mono text-caption text-text-tertiary">{children}</span>
      {contagem !== undefined && <span className="ml-auto font-mono text-caption tabular-nums text-text-tertiary">{contagem}</span>}
      {acoes && <span className={cn("flex items-center gap-1", contagem === undefined && "ml-auto")}>{acoes}</span>}
    </div>
  );
}

/** Lista colada: linhas separadas por linha fina, sem cartão por item. */
export function ListaDeConfig({ children, className }: { children: React.ReactNode; className?: string }) {
  return <ul className={cn("flex flex-col divide-y divide-border-subtle border-y border-border-subtle", className)}>{children}</ul>;
}

/** Linha da lista (52–60px). Com onClick, a linha inteira é clicável. */
export function ItemDeConfig({
  icone,
  titulo,
  detalhe,
  direita,
  onClick,
  rotuloDoClique,
  className,
  children,
}: {
  icone?: React.ReactNode;
  titulo: React.ReactNode;
  detalhe?: React.ReactNode;
  direita?: React.ReactNode;
  onClick?: () => void;
  /** Nome do botão invisível que cobre a linha (leitor de tela). */
  rotuloDoClique?: string;
  className?: string;
  /** Conteúdo extra abaixo da linha (formulário aberto, log...). */
  children?: React.ReactNode;
}) {
  return (
    <li className={cn("relative", className)}>
      <div className={cn("flex min-h-[56px] flex-wrap items-center gap-x-3 gap-y-2 px-1 py-2.5", onClick && "rounded-[12px] transition-colors hover:bg-raised")}>
        {onClick && (
          <button
            type="button"
            onClick={onClick}
            aria-label={rotuloDoClique}
            className="absolute inset-0 z-0 rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-focus"
          />
        )}
        {icone && (
          <span className="pointer-events-none relative flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-raised text-text-secondary ring-1 ring-inset ring-border-subtle [&_svg]:size-4">
            {icone}
          </span>
        )}
        <div className="pointer-events-none relative min-w-[140px] flex-1">
          <div className="truncate text-body font-medium text-text-primary">{titulo}</div>
          {detalhe && <div className="truncate text-caption text-text-tertiary">{detalhe}</div>}
        </div>
        {direita && <div className="relative z-10 ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">{direita}</div>}
      </div>
      {children}
    </li>
  );
}

/** Estado vazio curto: uma frase e, se houver, uma ação. */
export function VazioDeConfig({ children, acao }: { children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 border-y border-border-subtle px-1 py-5">
      <p className="text-small text-text-tertiary">{children}</p>
      {acao}
    </div>
  );
}

/** Esqueleto de lista enquanto carrega. */
export function EsqueletoDeLista({ linhas = 3 }: { linhas?: number }) {
  return (
    <div className="flex flex-col gap-2" aria-hidden="true">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="h-12 animate-pulse rounded-[14px] bg-raised motion-reduce:animate-none" />
      ))}
    </div>
  );
}
