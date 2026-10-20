"use client";

import * as React from "react";
import { Bot, CalendarCheck, ListTodo, Mail, MapPin, MessageCircle, Phone, Sparkles, Users, type LucideIcon } from "lucide-react";
import Link from "@/components/contrato/link";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { acaoDeUmClique, tipoParaExibir, type OrigemDaTarefa, type TipoDeTarefa } from "@/lib/tarefas/tipos";

// Peças pequenas das telas de tarefas: ícone do tipo, rótulo de origem e o
// botão da ação de um clique (tel:, conversa do WhatsApp, mailto:).

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

/** Tarefa gerada por automação ou IA ganha rótulo (a manual não). IA usa o violeta reservado. */
export function RotuloDaOrigem({ origem }: { origem: OrigemDaTarefa }) {
  if (origem === "automacao") {
    return (
      <Badge variant="neutral" title="Criada por uma automação (fluxo, régua ou integração)">
        <Bot size={12} aria-hidden /> Automação
      </Badge>
    );
  }
  if (origem === "ia") {
    return (
      <Badge variant="accent" title="Criada pela IA">
        <Sparkles size={12} aria-hidden /> IA
      </Badge>
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

export function SemTarefas({ texto }: { texto: string }) {
  return (
    <p className="flex items-center gap-2 py-6 text-center text-body text-text-secondary">
      <CalendarCheck size={16} aria-hidden className="text-text-tertiary" /> {texto}
    </p>
  );
}
