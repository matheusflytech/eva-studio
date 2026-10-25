"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { UserRound } from "lucide-react";
import Link from "@/components/contrato/link";
import { cn } from "@/lib/utils";
import { focusRing } from "@/components/ui/styles";
import { IconeDoTipo } from "@/components/tarefas/pecas";
import type { TarefaDaTela } from "@/lib/tarefas/tela";
import { FotoDoContato } from "./foto-do-contato";

// Painel à direita da lista (modelo "Alloy"): sem contato aberto mostra as
// próximas atividades; com contato aberto, a ficha entra deslizando.

const MOLA = [0.32, 0.72, 0, 1] as const;

/** Troca o conteúdo do painel com deslize + opacidade (sem movimento se a pessoa pediu menos movimento). */
export function PainelDeContatos({ chave, children }: { chave: string; children: React.ReactNode }) {
  const reduzir = useReducedMotion();
  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-[22px] border border-border-subtle bg-panel">
      <AnimatePresence initial={false}>
        <motion.div
          key={chave}
          className="absolute inset-0 overflow-y-auto px-5 py-4"
          initial={reduzir ? { opacity: 0 } : { opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0, transition: { duration: reduzir ? 0.12 : 0.45, ease: MOLA, delay: reduzir ? 0 : 0.08 } }}
          exit={reduzir ? { opacity: 0, transition: { duration: 0.1 } } : { opacity: 0, x: -24, transition: { duration: 0.3, ease: MOLA } }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// ── Próximas atividades ────────────────────────────────────────────────────

const SP = "America/Sao_Paulo";
const fmtDia = new Intl.DateTimeFormat("pt-BR", { timeZone: SP, year: "numeric", month: "2-digit", day: "2-digit" });
const fmtHora = new Intl.DateTimeFormat("pt-BR", { timeZone: SP, hour: "2-digit", minute: "2-digit" });
const fmtCurto = new Intl.DateTimeFormat("pt-BR", { timeZone: SP, day: "2-digit", month: "2-digit" });

function quando(iso: string, diaTodo: boolean, agora: Date): string {
  const d = new Date(iso);
  const hora = diaTodo ? "" : ` ${fmtHora.format(d)}`;
  const dia = fmtDia.format(d);
  if (dia === fmtDia.format(agora)) return `hoje${hora}`;
  if (dia === fmtDia.format(new Date(agora.getTime() + 86_400_000))) return `amanhã${hora}`;
  return `${fmtCurto.format(d)}${hora}`;
}

interface Atividade {
  id: string;
  tipo: string;
  texto: string;
  quando: string | null;
  atrasada: boolean;
  contato: { id: string; nome: string };
}

const LIMITE = 8;

/**
 * As tarefas em aberto (da visão padrão de Tarefas de quem olha) que têm
 * contato: ligar, reunião, follow-up, com quem e quando. Tocar no nome abre a
 * ficha. Sem tarefa (ou sem permissão de ver tarefas), o estado vazio.
 */
export function ProximasAtividades({ versao, onAbrirContato }: { versao: number; onAbrirContato: (id: string) => void }) {
  const [itens, setItens] = React.useState<Atividade[] | null>(null);

  React.useEffect(() => {
    let vivo = true;
    fetch("/api/tasks?status=abertas")
      .then((r) => (r.ok ? r.json() : { tasks: [] }))
      .then((d: { tasks?: TarefaDaTela[] }) => {
        if (!vivo) return;
        const agora = new Date();
        setItens(
          (d.tasks ?? [])
            .filter((t) => t.contact && !t.doneAt)
            .slice(0, LIMITE)
            .map((t) => ({
              id: t.id,
              tipo: t.type,
              texto: t.text,
              quando: t.dueAt ? quando(t.dueAt, t.diaTodo, agora) : null,
              atrasada: t.overdue,
              contato: { id: t.contact!.id, nome: t.contact!.name || t.contact!.phone || t.contact!.email || "Sem nome" },
            }))
        );
      })
      .catch(() => vivo && setItens([]));
    return () => {
      vivo = false;
    };
  }, [versao]);

  if (itens === null) {
    return (
      <div className="flex flex-col gap-3" role="status" aria-label="Carregando atividades">
        <span className="block h-7 w-52 animate-pulse rounded-lg bg-raised motion-reduce:animate-none" />
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="block h-10 animate-pulse rounded-xl bg-raised motion-reduce:animate-none" />
        ))}
      </div>
    );
  }

  if (itens.length === 0) return <SelecioneUmContato />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-title font-semibold tracking-tight text-text-primary">Próximas atividades</h2>
        <Link href="/tasks" className={cn("rounded-full px-2 py-1 text-small font-medium text-accent-fg hover:underline", focusRing)}>
          Ver tarefas
        </Link>
      </div>
      {/* Linha do tempo: a régua vertical passa por trás das bolinhas. */}
      <ol className="relative flex flex-col before:absolute before:bottom-4 before:left-[15px] before:top-4 before:w-px before:bg-border-default">
        {itens.map((a) => (
          <li key={a.id} className="relative flex min-h-11 items-center gap-2.5 text-small text-text-secondary">
            <span className="z-10 grid size-8 shrink-0 place-items-center rounded-full bg-raised ring-1 ring-border-default">
              <IconeDoTipo tipo={a.tipo} className="size-3.5 text-text-secondary" />
            </span>
            <span className="min-w-0 flex-1 truncate text-text-primary">{a.texto}</span>
            <button
              type="button"
              onClick={() => onAbrirContato(a.contato.id)}
              className={cn("inline-flex max-w-40 shrink-0 items-center gap-1.5 rounded-full px-1 font-medium text-accent-fg hover:underline", focusRing)}
            >
              <FotoDoContato nome={a.contato.nome} semente={a.contato.id} tamanho="xs" />
              <span className="truncate">{a.contato.nome.split(/\s+/)[0]}</span>
            </button>
            {a.quando && (
              <span
                className={cn(
                  "shrink-0 rounded-full bg-raised px-2 py-0.5 font-mono text-caption ring-1 ring-border-subtle",
                  a.atrasada ? "text-danger" : "text-text-secondary"
                )}
              >
                {a.quando}
              </span>
            )}
          </li>
        ))}
      </ol>
      <p className="text-caption text-text-tertiary">Selecione um contato na lista para abrir a ficha aqui.</p>
    </div>
  );
}

function SelecioneUmContato() {
  return (
    <div className="flex h-full min-h-80 flex-col items-center justify-center gap-3 text-center">
      <span className="grid size-14 place-items-center rounded-full bg-raised ring-1 ring-border-subtle">
        <UserRound size={22} aria-hidden="true" className="text-text-tertiary" />
      </span>
      <div>
        <p className="text-body font-semibold text-text-primary">Selecione um contato</p>
        <p className="mt-1 max-w-64 text-small text-text-tertiary">A ficha abre aqui, com etiquetas, tarefas e negócios.</p>
      </div>
    </div>
  );
}
