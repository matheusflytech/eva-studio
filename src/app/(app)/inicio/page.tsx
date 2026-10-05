"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight, MessageSquare, CheckCircle2, AlertTriangle, Wrench, Aperture, Plus,
} from "lucide-react";
import { useAuth } from "@/lib/auth/auth-context";
import { Starburst } from "@/components/agent-studio/starburst";
import { buttonVariants } from "@/components/ui/button";
import { cn, formatRelativeDate } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Início.
//
// A versão anterior respondia "quantos agentes você tem" — que a pessoa já
// sabe — e completava com um número inventado ("Conversas hoje (simulado)"),
// vindo de lib/mock-metrics. Número falso na porta de entrada do produto é a
// pior estreia possível: é o primeiro dado que alguém vê, e é mentira.
//
// Agora a tela responde a única pergunta que uma home precisa responder: o que
// precisa de mim agora. E quando não precisa de nada, ela diz isso — "tudo em
// dia" é uma resposta legítima, não um espaço a ser preenchido com cartão.
// ---------------------------------------------------------------------------

interface Pendencia {
  id: string;
  tipo: "urgente" | "atencao" | "config";
  titulo: string;
  detalhe: string;
  href: string;
  quantidade?: number;
}

interface AgenteResumo {
  id: string;
  nome: string;
  status: string;
  temFluxo: boolean;
  atualizadoEm: string;
}

interface Payload {
  onboardingPendente?: boolean;
  pendencias: Pendencia[];
  resumo: { agentes: number; conversas7d: number; tudoEmDia: boolean };
  agentes: AgenteResumo[];
}

const TOM: Record<Pendencia["tipo"], { anel: string; icone: string; Icone: React.ComponentType<{ size?: number; className?: string }> }> = {
  urgente: { anel: "ring-danger/30", icone: "bg-danger/12 text-danger", Icone: AlertTriangle },
  atencao: { anel: "ring-amber-400/25", icone: "bg-amber-400/12 text-amber-300", Icone: AlertTriangle },
  config: { anel: "ring-border-subtle", icone: "bg-surface-3 text-text-secondary", Icone: Wrench },
};

export default function InicioPage() {
  const { session } = useAuth();
  const [dados, setDados] = React.useState<Payload | null>(null);
  const [carregando, setCarregando] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/inicio")
      .then((r) => r.json())
      .then((d) => setDados(d.error ? null : d))
      .catch(() => setDados(null))
      .finally(() => setCarregando(false));
  }, []);

  const primeiroNome = session?.name?.split(" ")[0] ?? "";
  const pendencias = dados?.pendencias ?? [];
  const semAgente = !!dados && dados.resumo.agentes === 0;
  const comecar = !!dados?.onboardingPendente;

  return (
    <div className="flex-1 p-8">
      {/* Hero. O starburst e o gradiente são a cara do app e ficam — o que muda
          é o que está escrito em cima deles. */}
      <div className="glass-card relative mb-5 overflow-hidden rounded-3xl p-8">
        <div
          className="absolute inset-0 opacity-[0.5]"
          style={{ backgroundImage: "radial-gradient(ellipse at top left, rgba(245,247,250,0.12), transparent 60%)" }}
        />
        <Starburst className="pointer-events-none absolute -right-20 -top-24 h-[320px] w-[320px] opacity-[0.28]" />

        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-lg">
            <h1 className="font-display text-[28px] font-semibold leading-tight text-text-primary">
              {primeiroNome ? `Bem-vindo, ${primeiroNome}` : "Bem-vindo"}
            </h1>
            <p className="mt-2 text-[14.5px] leading-relaxed text-text-secondary">
              {carregando
                ? "Vendo o que precisa de você..."
                : comecar
                  ? "Escolha o seu tipo de negócio e, em um minuto, o funil, os campos e um atendimento de WhatsApp ficam prontos."
                  : semAgente
                  ? "Nada por aqui ainda. O primeiro passo é criar um agente e dar um fluxo pra ele."
                  : pendencias.length === 0
                    ? "Nada pedindo atenção agora. Os agentes estão no ar, as tarefas em dia e nenhum negócio está parado."
                    : pendencias.length === 1
                      ? "Uma coisa precisa de você."
                      : `${pendencias.length} coisas precisam de você.`}
            </p>

            {comecar ? (
              <Link href="/comecar" className={cn(buttonVariants({ variant: "solid", size: "md" }), "mt-5")}>
                Montar o meu CRM <ArrowRight size={15} />
              </Link>
            ) : semAgente ? (
              <Link href="/agent-studio/new" className={cn(buttonVariants({ variant: "solid", size: "md" }), "mt-5")}>
                <Plus size={15} /> Criar o primeiro agente
              </Link>
            ) : (
              <Link href="/agent-studio" className={cn(buttonVariants({ variant: "secondary", size: "md" }), "mt-5")}>
                Ir para os agentes <ArrowRight size={15} />
              </Link>
            )}
          </div>

          {/* Um número só, e verdadeiro. */}
          {dados && !semAgente && (
            <div className="relative shrink-0 text-right">
              <p className="font-display text-[42px] font-semibold leading-none text-text-primary tabular-nums">
                {dados.resumo.conversas7d}
              </p>
              <p className="mt-1.5 text-[12px] text-text-tertiary">
                {dados.resumo.conversas7d === 1 ? "conversa" : "conversas"} nos últimos 7 dias
              </p>
            </div>
          )}
        </div>
      </div>

      {carregando ? (
        <p className="text-[13px] text-text-tertiary">Carregando...</p>
      ) : pendencias.length > 0 ? (
        <section className="mb-5">
          <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
            Precisa de você
          </h2>
          <div className="flex flex-col gap-2">
            {pendencias.map((p) => {
              const tom = TOM[p.tipo];
              const Icone = tom.Icone;
              return (
                <Link
                  key={p.id}
                  href={p.href}
                  className={cn(
                    "glass-card group flex items-center gap-4 rounded-2xl px-5 py-4 ring-1 transition-colors hover:border-border-strong",
                    tom.anel
                  )}
                >
                  <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl", tom.icone)}>
                    <Icone size={16} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-medium text-text-primary">{p.titulo}</span>
                    <span className="block text-[12.5px] text-text-secondary">{p.detalhe}</span>
                  </span>
                  <ArrowRight
                    size={15}
                    className="shrink-0 text-text-tertiary transition-colors group-hover:text-text-primary"
                  />
                </Link>
              );
            })}
          </div>
        </section>
      ) : !semAgente ? (
        <section className="glass-card mb-5 flex items-center gap-4 rounded-3xl px-6 py-7">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/12 text-emerald-300">
            <CheckCircle2 size={21} />
          </span>
          <div>
            <p className="text-[14.5px] font-medium text-text-primary">Tudo em dia</p>
            <p className="mt-0.5 text-[13px] text-text-secondary">
              Ninguém esperando atendimento, nenhuma tarefa vencida, nenhum negócio esquecido e nenhum bloco
              incompleto travando agente.
            </p>
          </div>
        </section>
      ) : null}

      {dados && dados.agentes.length > 0 && (
        <section>
          <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-wide text-text-tertiary">
            Seus agentes
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {dados.agentes.map((a) => (
              <Link
                key={a.id}
                href={`/agent-studio/${a.id}`}
                className="glass-card group flex flex-col rounded-2xl p-4 transition-colors hover:border-border-strong"
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface-3 text-text-secondary">
                    <Aperture size={17} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium text-text-primary">{a.nome}</span>
                    <span className="block text-[11.5px] text-text-tertiary">
                      {a.temFluxo ? "com fluxo" : "sem fluxo"}
                    </span>
                  </span>
                </div>
                <span className="mt-3 flex items-center justify-between border-t border-border-subtle pt-2.5 text-[11.5px] text-text-tertiary">
                  editado {formatRelativeDate(a.atualizadoEm)}
                  <ArrowRight size={12} className="opacity-0 transition-opacity group-hover:opacity-100" />
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {dados && !semAgente && (
        <p className="mt-6 flex items-center gap-1.5 text-[12px] text-text-tertiary">
          <MessageSquare size={12} />
          Todo número desta tela sai do banco. Nada aqui é estimativa.
        </p>
      )}
    </div>
  );
}
