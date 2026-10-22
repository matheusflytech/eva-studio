"use client";

import * as React from "react";
import { Bot, CalendarCheck, Circle, CircleCheck, ListTodo, Mail, MapPin, MessageCircle, Phone, Users, type LucideIcon } from "lucide-react";
import Link from "@/components/contrato/link";
import { buttonVariants } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { MarcaEva } from "@/components/layout/marca-eva";
import { cn } from "@/lib/utils";
import { acaoDeUmClique, tipoParaExibir, type OrigemDaTarefa, type TipoDeTarefa } from "@/lib/tarefas/tipos";

// Peças pequenas das telas de tarefas: ícone do tipo, marca de origem, o
// botão da ação de um clique (tel:, conversa do WhatsApp, mailto:), o círculo
// de concluir e a moldura da tela (barra + sub-barra), que cada aba preenche.

export const ICONE_DO_TIPO: Record<TipoDeTarefa, LucideIcon> = {
  ligar: Phone,
  whatsapp: MessageCircle,
  email: Mail,
  reuniao: Users,
  visita: MapPin,
  afazer: ListTodo,
};

export function IconeDoTipo({ tipo, className }: { tipo: string; className?: string }) {
  const Icone = ICONE_DO_TIPO[tipoParaExibir(tipo)];
  return <Icone size={16} strokeWidth={1.5} aria-hidden className={cn("shrink-0 text-text-tertiary", className)} />;
}

/**
 * Tarefa gerada por automação ou IA ganha uma marca pequena antes do título
 * (a manual não). IA é o símbolo da Eva, não uma cor.
 */
export function RotuloDaOrigem({ origem }: { origem: OrigemDaTarefa }) {
  if (origem === "automacao") {
    return (
      <span title="Criada por uma automação (fluxo, régua ou integração)" className="inline-flex shrink-0 text-text-tertiary">
        <Bot size={13} aria-hidden />
        <span className="sr-only">Criada por automação.</span>
      </span>
    );
  }
  if (origem === "ia") {
    return (
      <span title="Criada pela Eva (IA)" className="inline-flex shrink-0 text-text-secondary">
        <MarcaEva size={12} />
        <span className="sr-only">Criada pela IA.</span>
      </span>
    );
  }
  return null;
}

export function AcaoRapida({
  tipo,
  contato,
  tamanho = "sm",
}: {
  tipo: string;
  contato: { telefone?: string | null; email?: string | null; conversaId?: string | null } | null;
  tamanho?: "sm" | "md";
}) {
  const acao = acaoDeUmClique(tipo, contato);
  if (!acao) return null;
  const Icone = ICONE_DO_TIPO[tipoParaExibir(tipo)];
  const classe = buttonVariants({ variant: "secondary", size: tamanho });
  const conteudo = (
    <>
      <Icone size={14} aria-hidden /> {acao.rotulo}
    </>
  );
  if (acao.externo) {
    return (
      <a href={acao.href} className={classe} target={acao.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
        {conteudo}
      </a>
    );
  }
  return (
    <Link href={acao.href} className={classe}>
      {conteudo}
    </Link>
  );
}

/** Círculo vazio que vira check ao passar o mouse: concluir em um clique. */
export function BotaoConcluir({ texto, onConcluir }: { texto: string; onConcluir: (el: HTMLElement) => void }) {
  return (
    <IconButton
      aria-label={`Concluir: ${texto}`}
      tooltip="Concluir"
      size="sm"
      onClick={(e) => onConcluir(e.currentTarget)}
      className="group/ok shrink-0 text-text-tertiary hover:bg-transparent hover:text-success"
    >
      <Circle className="group-hover/ok:hidden group-focus-visible/ok:hidden" strokeWidth={1.5} />
      <CircleCheck className="hidden group-hover/ok:block group-focus-visible/ok:block" strokeWidth={1.5} />
    </IconButton>
  );
}

/**
 * Ações da linha (ligar, adiar...) que só aparecem ao passar o mouse ou com
 * foco. Some por opacidade, não por display: o menu aberto continua ancorado
 * no botão. Em tela de toque ficam sempre visíveis.
 */
export const acoesDaLinha = cn(
  "flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-150",
  "group-hover/linha:opacity-100 focus-within:opacity-100 [&:has([data-state=open])]:opacity-100 [@media(hover:none)]:opacity-100"
);

/** Separador fino entre linhas, começando depois do círculo de concluir. */
export const linhaDeLista = cn(
  "group/linha relative flex min-h-[54px] items-center gap-3 rounded-xl px-2 py-1.5 transition-colors hover:bg-raised",
  "before:absolute before:left-11 before:right-2 before:top-0 before:h-px before:bg-border-subtle first:before:hidden hover:before:opacity-0 [&:hover+li]:before:opacity-0"
);

/** Rótulo de grupo (Agora, Com hora marcada...): mono pequeno. */
export function TituloDeGrupo({ id, children, className }: { id?: string; children: React.ReactNode; className?: string }) {
  return (
    <h2 id={id} className={cn("px-2 pb-1 font-mono text-caption text-text-tertiary", className)}>
      {children}
    </h2>
  );
}

/** O que cada aba põe na moldura da tela. */
export interface PartesDaTela {
  /** Ao lado do título: "27 hoje · 24 atrasadas". */
  contagem?: React.ReactNode;
  /** À direita do título, depois de "Nova tarefa": "…" e a ação principal. */
  acoes?: React.ReactNode;
  /** À direita da sub-barra, ao lado das abas. */
  lateral?: React.ReactNode;
  conteudo: React.ReactNode;
}

export type Moldura = (partes: PartesDaTela) => React.ReactNode;

export function SemTarefas({ texto }: { texto: string }) {
  return (
    <p className="flex items-center gap-2 py-6 text-center text-body text-text-secondary">
      <CalendarCheck size={16} aria-hidden className="text-text-tertiary" /> {texto}
    </p>
  );
}
