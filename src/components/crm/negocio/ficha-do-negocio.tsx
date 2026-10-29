"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { ArrowLeft, Handshake, RefreshCw, TriangleAlert } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/utils";
import { useFicha, type NegocioDaFicha } from "./use-ficha";
import { CabecalhoDoNegocio } from "./cabecalho";
import { EtapaAtual, TrilhaDeEtapas } from "./trilha-de-etapas";
import { SobreONegocio } from "./sobre-o-negocio";
import { AtividadeDoNegocio, FiltroNaBorda } from "./atividade";
import { VinculosDoNegocio } from "./vinculos";
import { OrigemDeMarketing } from "@/components/marketing/origem";
import { CartaoLateral } from "./cartao-lateral";
import { useItensDoNegocio } from "./produtos";
import type { FiltroDaLinhaDoTempo } from "./linha-do-tempo";
import { valorVemDosProdutos } from "@/lib/produtos";
import { useMudancaDeEtapa, type EtapaDoMovimento } from "@/components/crm/negocios/mudanca-de-etapa";
import { useRegistroEmFoco, type RegistroEmFoco } from "@/components/busca/registro-em-foco";

/**
 * Ficha completa do negócio, com endereço próprio (/deals/<id>) para
 * mandar o link a alguém. A prévia do kanban continua para o ajuste rápido;
 * aqui é onde se lê a história inteira.
 *
 * v5 ("folha clara sobre fundo escuro"): topo com título grande e as
 * decisões; faixa de resumo (valores, trilha de etapas com o tempo em cada
 * uma, contatos; e a etapa atual); e a linha do tempo numa folha clara, com o
 * filtro preso na borda, ao lado do cartão escuro com o que importa para
 * fechar. O resto (contatos, empresa, conversas, tarefas, campos) fica em
 * seções recolhíveis embaixo do cartão. Abaixo de xl tudo empilha.
 */
export function FichaDoNegocio({ dealId }: { dealId: string }) {
  const ficha = useFicha(dealId);
  const { estado, deal, defs, regras, linha, linhaFalhou, membros, agora, carregar, patch } = ficha;
  // Itens mudam o valor do negócio: cada mudança recarrega a ficha.
  const produtos = useItensDoNegocio(dealId, carregar);
  const [erro, setErro] = React.useState<string | null>(null);
  // Mudança de etapa com as regras (motivo da perda, "Complete para mover",
  // Reabrir): os mesmos modais do quadro. O aviso com Desfazer vai para a
  // ilha e o fundo pulsa a partir do chip da etapa.
  const mudanca = useMudancaDeEtapa({ onErro: setErro, naIlha: { elemento: () => document.querySelector("[data-etapa-atual]") } });
  const moverEtapa = React.useCallback(
    async (para: EtapaDoMovimento | null, extra?: Record<string, unknown>) => {
      if (!deal) return "erro" as const;
      setErro(null);
      const r = await mudanca.mover({
        dealId: deal.id,
        nome: deal.name,
        pipelineId: deal.pipelineId,
        para: para ?? { id: "", name: "", type: "open" },
        defs,
        extra,
        de: { id: deal.stage.id, name: deal.stage.name, type: deal.stage.type },
        aoDesfazer: () => void carregar(),
      });
      if (r === "movido") await carregar();
      return r;
    },
    [deal, defs, mudanca, carregar]
  );
  // Busca global (⌘K): ações deste negócio primeiro, pelas mesmas funções da ficha.
  const registro = React.useMemo<RegistroEmFoco | null>(() => {
    if (!deal) return null;
    const principal = deal.contacts[0]?.contact;
    return {
      tipo: "negocio",
      id: deal.id,
      titulo: deal.name || "Negócio sem nome",
      caminho: `/deals/${deal.id}`,
      subtitulo: [deal.company?.name, deal.stage.name].filter(Boolean).join(" · "),
      etapas: deal.pipeline.stages.map((s) => ({ id: s.id, nome: s.name, tipo: s.type })),
      etapaAtualId: deal.stageId,
      aoMudarEtapa: (id) => {
        const s = deal.pipeline.stages.find((x) => x.id === id);
        if (s) void moverEtapa({ id: s.id, name: s.name, type: s.type });
      },
      membros,
      donoAtualId: deal.ownerId,
      aoAtribuir: (userId) => {
        void patch({ ownerId: userId }).then((falha) => falha && setErro(falha));
      },
      whatsapp: principal ? { nome: principal.name || "o contato", telefone: principal.phone } : null,
      tarefa: { dealId: deal.id },
    };
  }, [deal, membros, moverEtapa, patch]);
  useRegistroEmFoco(registro);
  const [filtro, setFiltro] = React.useState<FiltroDaLinhaDoTempo>("tudo");
  const folhaRef = React.useRef<HTMLDivElement>(null);

  if (estado === "carregando") return <Esqueleto />;

  if (estado === "nao_encontrado") {
    return (
      <EmptyState
        icon={<Handshake size={40} className="text-text-tertiary" aria-hidden />}
        title="Negócio não encontrado"
        description="Ele pode ter sido apagado, ou o link é de outra organização."
        action={
          <Link href="/deals" className={buttonVariants({ variant: "primary" })}>
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
            <Link href="/deals" className={buttonVariants({ variant: "ghost" })}>
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

  // "Ver todas" / "Criar tarefa" das tarefas abertas: filtro Tarefas da folha (lista para criar e concluir).
  function verTarefas() {
    setFiltro("tarefas");
    folhaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const aberto = deal.stage.type === "open";
  const contatos = deal.contacts.map((c) => c.contact);

  return (
    <div className="flex flex-col gap-3 pb-6">
      <CabecalhoDoNegocio deal={deal} patch={patch} onErro={setErro} moverEtapa={moverEtapa} />
      {mudanca.elementos}

      {erro && (
        <Notice tone="danger" onDismiss={() => setErro(null)}>
          {erro}
        </Notice>
      )}

      {/* Faixa de resumo: quanto vale e onde está; ao lado, o que vale na etapa atual. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section aria-label="Resumo do negócio" className="flex min-w-0 flex-col gap-4 rounded-[24px] border border-border-subtle bg-panel px-5 py-4">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Valor rotulo="Valor">
              {deal.amountCents > 0 ? <EmReais cents={deal.amountCents} /> : <span className="text-title font-normal text-text-tertiary">Sem valor</span>}
            </Valor>
            {aberto && (
              <Valor rotulo={`Ponderado (${deal.probability}%)`}>
                <EmReais cents={Math.round((deal.amountCents * deal.probability) / 100)} apagado />
              </Valor>
            )}
            <Valor rotulo="Previsão de fechamento">
              <span className={cn("text-title font-medium tracking-tight", deal.expectedClosingAt ? "text-text-secondary" : "font-normal text-text-tertiary")}>
                {deal.expectedClosingAt ? diaDaPrevisao(deal.expectedClosingAt, agora) : "Sem previsão"}
              </span>
            </Valor>
          </dl>
          <div className="flex items-center gap-4">
            <TrilhaDeEtapas deal={deal} agora={agora} regras={regras} itens={linha.itens} moverEtapa={moverEtapa} />
            <PilhaDeContatos contatos={contatos} />
          </div>
        </section>
        <section aria-label="Etapa atual" className="rounded-[24px] border border-border-subtle bg-panel px-5 py-4">
          <EtapaAtual deal={deal} agora={agora} regras={regras} />
        </section>
      </div>

      {/* A folha: clara no tema escuro (tokens do claro via data-theme), branca com borda no claro.
          O filtro fica fora dela (mesmo tema da página) para a borda em volta da cápsula ser o fundo. */}
      <div ref={folhaRef} className="relative mt-5 scroll-mt-8">
        <FiltroNaBorda
          itens={linha.itens}
          filtro={filtro}
          onFiltro={setFiltro}
          className="absolute left-1/2 top-0 z-20 max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2"
        />
        <div
          data-theme="light"
          className={cn(
            "grid items-start gap-3 rounded-[26px] border border-border-subtle bg-panel px-3 pb-3 pt-9 xl:grid-cols-[minmax(0,1fr)_340px]",
            "[[data-theme=dark]_&]:border-transparent [[data-theme=dark]_&]:bg-page"
          )}
        >
          <div className="min-w-0 px-2">
            <AtividadeDoNegocio deal={deal} itens={linha.itens} linhaFalhou={linhaFalhou} agora={agora} filtro={filtro} recarregar={carregar} />
          </div>
          <div className="flex min-w-0 flex-col gap-3">
            <CartaoLateral deal={deal} membros={membros} patch={patch} produtos={produtos} moverEtapa={moverEtapa} />
            <VinculosDoNegocio deal={deal} conversas={linha.conversas} agora={agora} patch={patch} onVerTarefas={verTarefas} />
            {contatos.length > 0 && <OrigemDeMarketing dealId={deal.id} />}
            <SobreONegocio deal={deal} defs={defs} membros={membros} patch={patch} valorDosProdutos={valorVemDosProdutos(produtos.dados)} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Valor({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-small text-text-secondary">{rotulo}</dt>
      <dd className="truncate">{children}</dd>
    </div>
  );
}

/** Número grande e leve, com o "R$" pequeno e apagado (como nos valores das faturas). */
function EmReais({ cents, apagado = false }: { cents: number; apagado?: boolean }) {
  const reais = (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
  return (
    <span className={cn("text-heading font-medium tabular-nums tracking-[-0.035em]", apagado ? "text-text-secondary" : "text-text-primary")}>
      <span className="mr-1 align-[0.4em] text-body font-normal tracking-normal text-text-tertiary">R$</span>
      {reais}
    </span>
  );
}

/** "15 de nov." (com o ano quando não é o atual). Data sem hora: o dia é a parte UTC do ISO. */
function diaDaPrevisao(iso: string, agora: Date): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  const outroAno = d.getUTCFullYear() !== agora.getFullYear();
  return d.toLocaleDateString("pt-BR", { day: "numeric", month: "short", ...(outroAno ? { year: "numeric" } : {}), timeZone: "UTC" });
}

/** Contatos do negócio em pilha (até 3 e o "+N"). */
function PilhaDeContatos({ contatos }: { contatos: NegocioDaFicha["contacts"][number]["contact"][] }) {
  if (contatos.length === 0) return null;
  const nomes = contatos.map((c) => c.name || c.phone || c.email || "Sem nome");
  return (
    <span className="flex shrink-0 items-center" title={`Contatos do negócio: ${nomes.join(", ")}`}>
      {nomes.slice(0, 3).map((n, i) => (
        <Avatar key={i} name={n} className={cn("ring-2 ring-panel", i > 0 && "-ml-2")} />
      ))}
      {nomes.length > 3 && (
        <span className="-ml-2 inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-hover px-1 font-mono text-caption text-text-secondary ring-2 ring-panel">
          +{nomes.length - 3}
        </span>
      )}
    </span>
  );
}

function Bloco({ className }: { className: string }) {
  return <span aria-hidden className={`block animate-pulse rounded-lg bg-raised motion-reduce:animate-none ${className}`} />;
}

function Esqueleto() {
  return (
    <div className="flex flex-col gap-3" role="status" aria-label="Carregando negócio">
      <div className="flex h-16 items-center gap-3">
        <Bloco className="size-[34px] rounded-full" />
        <Bloco className="h-8 w-80 max-w-full" />
      </div>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <Bloco className="h-[150px] rounded-[24px]" />
        <Bloco className="hidden h-[150px] rounded-[24px] lg:block" />
      </div>
      <Bloco className="mt-5 h-[520px] rounded-[26px]" />
      <span className="sr-only">Carregando...</span>
    </div>
  );
}
