"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowLeft, Handshake, RefreshCw, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useFicha } from "./use-ficha";
import { CabecalhoDoNegocio } from "./cabecalho";
import { TrilhaDeEtapas } from "./trilha-de-etapas";
import { SobreONegocio } from "./sobre-o-negocio";
import { AtividadeDoNegocio, type AbaDaAtividade } from "./atividade";
import { VinculosDoNegocio } from "./vinculos";
import { ProdutosDoNegocio, useItensDoNegocio } from "./produtos";
import { valorVemDosProdutos } from "@/lib/produtos";

/**
 * Ficha completa do negócio, com endereço próprio (/negocios/<id>) para
 * mandar o link a alguém. A gaveta do kanban continua para o ajuste rápido;
 * aqui é onde se lê a história inteira.
 *
 * Abaixo de lg as colunas empilham na ordem de leitura de quem abre pelo
 * celular: o que é, onde está, com quem, e só então o histórico.
 */
export function FichaDoNegocio({ dealId }: { dealId: string }) {
  const ficha = useFicha(dealId);
  const { estado, deal, defs, linha, linhaFalhou, membros, agora, carregar, patch } = ficha;
  // Itens mudam o valor do negócio: cada mudança recarrega a ficha.
  const produtos = useItensDoNegocio(dealId, carregar);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aba, setAba] = React.useState<AbaDaAtividade>("atividade");
  const atividadeRef = React.useRef<HTMLDivElement>(null);

  if (estado === "carregando") return <Esqueleto />;

  if (estado === "nao_encontrado") {
    return (
      <EmptyState
        icon={<Handshake size={40} className="text-text-tertiary" aria-hidden />}
        title="Negócio não encontrado"
        description="Ele pode ter sido apagado, ou o link é de outra organização."
        action={
          <Link href="/negocios" className="inline-flex h-10 items-center gap-2 rounded-xl bg-accent-500 px-4 text-sm font-medium text-white outline-none hover:bg-accent-400 focus-visible:ring-2 focus-visible:ring-accent-500/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-base">
            <ArrowLeft size={15} aria-hidden /> Voltar para Negócios
          </Link>
        }
      />
    );
  }

  if (estado === "erro" || !deal) {
    return (
      <EmptyState
        icon={<TriangleAlert size={40} className="text-danger" aria-hidden />}
        title="Não foi possível abrir o negócio"
        description="Verifique a conexão e tente de novo."
        action={
          <div className="flex gap-2">
            <Link href="/negocios" className="inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-medium text-text-secondary outline-none hover:bg-surface-2 hover:text-text-primary focus-visible:ring-2 focus-visible:ring-accent-500/60">
              <ArrowLeft size={15} aria-hidden /> Negócios
            </Link>
            <Button onClick={() => carregar()}>
              <RefreshCw size={15} aria-hidden /> Tentar de novo
            </Button>
          </div>
        }
      />
    );
  }

  function verTarefas() {
    setAba("tarefas");
    atividadeRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="flex flex-col gap-4 pb-6">
      <CabecalhoDoNegocio deal={deal} membros={membros} patch={patch} onErro={setErro} />

      {erro && (
        <div role="alert" className="flex items-start justify-between gap-3 rounded-xl border border-danger/25 bg-danger/10 px-4 py-2.5 text-[13px] text-danger">
          <span>{erro}</span>
          <button
            type="button"
            onClick={() => setErro(null)}
            aria-label="Fechar aviso"
            className="rounded p-0.5 outline-none hover:bg-danger/15 focus-visible:ring-2 focus-visible:ring-danger/60"
          >
            <X size={14} />
          </button>
        </div>
      )}

      <TrilhaDeEtapas deal={deal} agora={agora} patch={patch} onErro={setErro} />

      {/* Áreas nomeadas: a ordem no celular (sobre, vínculos, atividade) não é
          a ordem das colunas no desktop, e grid-area resolve as duas sem
          duplicar nada. Entre lg e xl a atividade ocupa a coluna larga e os
          dois blocos laterais dividem a estreita. */}
      <div
        className={
          "grid items-start gap-4 [grid-template-areas:'sobre'_'vinculos'_'atividade'] " +
          "lg:grid-cols-[300px_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:[grid-template-areas:'sobre_atividade'_'vinculos_atividade'] " +
          "xl:grid-cols-[280px_minmax(0,1fr)_320px] xl:grid-rows-[auto] xl:[grid-template-areas:'sobre_atividade_vinculos']"
        }
      >
        <div className="min-w-0 [grid-area:sobre]">
          <SobreONegocio
            deal={deal}
            defs={defs}
            membros={membros}
            patch={patch}
            valorDosProdutos={valorVemDosProdutos(produtos.dados)}
          />
        </div>
        <div ref={atividadeRef} className="flex min-w-0 scroll-mt-4 flex-col gap-4 [grid-area:atividade]">
          <ProdutosDoNegocio estado={produtos} />
          <AtividadeDoNegocio
            deal={deal}
            itens={linha.itens}
            linhaFalhou={linhaFalhou}
            agora={agora}
            aba={aba}
            onAba={setAba}
            recarregar={carregar}
          />
        </div>
        <div className="min-w-0 [grid-area:vinculos]">
          <VinculosDoNegocio deal={deal} conversas={linha.conversas} agora={agora} patch={patch} onVerTarefas={verTarefas} />
        </div>
      </div>
    </div>
  );
}

function Bloco({ className }: { className: string }) {
  return <span aria-hidden className={`block animate-pulse rounded-lg bg-surface-2 motion-reduce:animate-none ${className}`} />;
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-4" role="status" aria-label="Carregando negócio">
      <Bloco className="h-4 w-40" />
      <Bloco className="h-8 w-80 max-w-full" />
      <Bloco className="h-6 w-56" />
      <Bloco className="h-[72px] w-full rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <Bloco className="h-[420px] rounded-2xl" />
        <Bloco className="h-[520px] rounded-2xl" />
        <Bloco className="hidden h-[360px] rounded-2xl xl:block" />
      </div>
      <span className="sr-only">Carregando...</span>
    </div>
  );
}
