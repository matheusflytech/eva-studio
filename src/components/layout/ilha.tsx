"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { CalendarClock, MessageCircle, X } from "lucide-react";
import Link from "@/components/contrato/link";
import { useSondagem } from "@/components/inbox/use-sondagem";
import { EVENTO_ILHA, type AvisoDaIlha } from "@/lib/fundo/eventos";
import { cn } from "@/lib/utils";
import { MOLA } from "@/lib/design-system/movimento";

// ---------------------------------------------------------------------------
// Notificações (antes "ilha"). Dois jeitos, conforme o aviso:
// - Alerta (`alerta`): algo que pede atenção e não veio de você (alguém
//   esperando atendimento, compromisso em 10 min). Cartão desce do topo, fica
//   alguns segundos e sobe; chegando outro, empilha (até 3). Arrastar para
//   cima dispensa; mouse em cima segura o tempo.
// - Confirmação (o resto): o que você acabou de fazer (moveu, duplicou,
//   apagou). Uma linha discreta embaixo, com Desfazer quando houver; a nova
//   substitui a anterior em vez de empilhar.
// ---------------------------------------------------------------------------

interface Resumo {
  esperando: number;
  naoLidas: number;
}

interface Notificacao extends AvisoDaIlha {
  id: number;
}

/** Quantos alertas aparecem na pilha (os mais antigos além disso somem). */
const NA_PILHA = 3;

const ICONE_DO_ALERTA = { conversa: MessageCircle, agenda: CalendarClock } as const;

export function Ilha({ className }: { className?: string }) {
  const reduzir = useReducedMotion();
  const [lista, setLista] = React.useState<Notificacao[]>([]);
  const [confirmacao, setConfirmacao] = React.useState<Notificacao | null>(null);
  const [segurando, setSegurando] = React.useState(false);
  const anterior = React.useRef<number | null>(null);
  const proximoId = React.useRef(0);
  const timers = React.useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dispensar = React.useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setLista((l) => l.filter((n) => n.id !== id));
  }, []);

  const agendar = React.useCallback(
    (n: Notificacao) => {
      timers.current.set(
        n.id,
        setTimeout(() => dispensar(n.id), n.duracao ?? 5000)
      );
    },
    [dispensar]
  );

  const abrir = React.useCallback(
    (a: AvisoDaIlha) => {
      const n: Notificacao = { ...a, id: ++proximoId.current };
      if (!a.alerta) {
        setConfirmacao(n);
        return;
      }
      setLista((l) => [n, ...l].slice(0, NA_PILHA));
      agendar(n);
    },
    [agendar]
  );

  // Mouse em cima segura todas; ao sair, cada uma volta a contar do zero.
  React.useEffect(() => {
    if (segurando) {
      for (const t of timers.current.values()) clearTimeout(t);
      timers.current.clear();
      return;
    }
    for (const n of lista) if (!timers.current.has(n.id)) agendar(n);
  }, [segurando, lista, agendar]);

  useSondagem(async () => {
    const res = await fetch("/api/inbox/summary");
    if (!res.ok) return;
    const dados = (await res.json()) as Resumo;
    const antes = anterior.current;
    if (antes !== null && dados.esperando > antes) {
      abrir({
        alerta: "conversa",
        titulo: dados.esperando - antes === 1 ? "Uma pessoa quer falar com a equipe" : `${dados.esperando - antes} pessoas querem falar com a equipe`,
        detalhe: "O agente passou a conversa",
        acao: { rotulo: "Atender", href: "/conversations" },
      });
    }
    anterior.current = dados.esperando;
  }, 20_000);

  React.useEffect(() => {
    const aoAviso = (e: Event) => abrir((e as CustomEvent<AvisoDaIlha>).detail);
    window.addEventListener(EVENTO_ILHA, aoAviso);
    const mapa = timers.current;
    return () => {
      window.removeEventListener(EVENTO_ILHA, aoAviso);
      for (const t of mapa.values()) clearTimeout(t);
    };
  }, [abrir]);

  return (
    <>
      <div
        role="region"
        aria-label="Notificações"
        aria-live="polite"
        className={cn("pointer-events-none absolute inset-x-0 top-3 z-50 flex justify-center px-4", className)}
        data-print-ocultar
      >
        <div className="relative w-full max-w-[400px]" onMouseEnter={() => setSegurando(true)} onMouseLeave={() => setSegurando(false)}>
          <AnimatePresence initial={false}>
            {lista.map((n, i) => (
              <motion.div
                key={n.id}
                layout
                initial={reduzir ? { opacity: 0 } : { opacity: 0, y: -72, scale: 0.94 }}
                animate={{ opacity: i === 0 ? 1 : 0.9 - i * 0.2, y: i * 10, scale: 1 - i * 0.05 }}
                exit={reduzir ? { opacity: 0 } : { opacity: 0, y: -60, scale: 0.96, transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] } }}
                transition={MOLA}
                drag={i === 0 ? "y" : false}
                dragConstraints={{ top: 0, bottom: 0 }}
                dragElastic={{ top: 0.6, bottom: 0.08 }}
                onDragEnd={(_, info: PanInfo) => {
                  if (info.offset.y < -24 || info.velocity.y < -300) dispensar(n.id);
                }}
                style={{ zIndex: NA_PILHA - i, transformOrigin: "top center" }}
                className={cn("absolute inset-x-0 top-0", i === 0 ? "pointer-events-auto" : "pointer-events-none")}
              >
                <CartaoDeAlerta notificacao={n} onFechar={() => dispensar(n.id)} />
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
      <div
        role="region"
        aria-label="Confirmações"
        aria-live="polite"
        className="pointer-events-none absolute inset-x-0 bottom-6 z-50 flex justify-center px-4"
        data-print-ocultar
      >
        <AnimatePresence initial={false} mode="popLayout">
          {confirmacao && (
            <motion.div
              key={confirmacao.id}
              initial={reduzir ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduzir ? { opacity: 0 } : { opacity: 0, y: 8, transition: { duration: 0.16 } }}
              transition={MOLA}
              className="pointer-events-auto max-w-full"
            >
              <LinhaDeConfirmacao notificacao={confirmacao} onFechar={() => setConfirmacao((c) => (c?.id === confirmacao.id ? null : c))} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

function BotaoDaAcao({ n, onFechar, className }: { n: Notificacao; onFechar: () => void; className: string }) {
  if (!n.acao) return null;
  return n.acao.href ? (
    <Link href={n.acao.href} onClick={onFechar} className={className}>
      {n.acao.rotulo}
    </Link>
  ) : (
    <button
      type="button"
      onClick={() => {
        n.acao?.aoClicar?.();
        onFechar();
      }}
      className={className}
    >
      {n.acao.rotulo}
    </button>
  );
}

function CartaoDeAlerta({ notificacao: n, onFechar }: { notificacao: Notificacao; onFechar: () => void }) {
  const Icone = ICONE_DO_ALERTA[n.alerta ?? "conversa"];
  return (
    <div
      role="status"
      className="group/notificacao relative flex cursor-grab items-center gap-3 rounded-[18px] border border-border-subtle bg-overlay p-3 pr-3.5 shadow-overlay active:cursor-grabbing"
    >
      {n.avatar ? (
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-raised text-caption font-semibold text-text-primary">{n.avatar}</span>
      ) : (
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent/10 text-accent-fg">
          <Icone size={17} aria-hidden="true" />
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <p className="truncate text-small font-semibold text-text-primary">{n.titulo}</p>
        {n.detalhe && <p className="truncate text-small text-text-secondary">{n.detalhe}</p>}
      </div>
      <BotaoDaAcao
        n={n}
        onFechar={onFechar}
        className="inline-flex h-8 shrink-0 items-center rounded-full bg-inverse px-3.5 text-small font-semibold text-inverse-fg transition-opacity hover:opacity-90"
      />
      <button
        type="button"
        onClick={onFechar}
        aria-label="Dispensar notificação"
        className="absolute -left-1.5 -top-1.5 grid size-5 place-items-center rounded-full border border-border-subtle bg-overlay text-text-secondary opacity-0 shadow-sm transition-opacity duration-150 focus-visible:opacity-100 group-hover/notificacao:opacity-100"
      >
        <X size={11} strokeWidth={2.5} aria-hidden="true" />
      </button>
    </div>
  );
}

function LinhaDeConfirmacao({ notificacao: n, onFechar }: { notificacao: Notificacao; onFechar: () => void }) {
  const [pausado, setPausado] = React.useState(false);
  // onFechar muda a cada render; o ref evita reiniciar o relógio.
  const fecharRef = React.useRef(onFechar);
  React.useEffect(() => {
    fecharRef.current = onFechar;
  });
  React.useEffect(() => {
    if (pausado) return;
    const t = setTimeout(() => fecharRef.current(), n.duracao ?? 4000);
    return () => clearTimeout(t);
  }, [pausado, n.duracao]);

  return (
    <div
      role="status"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
      className="flex h-10 min-w-0 items-center gap-3 rounded-full bg-inverse pl-4 pr-1.5 text-small text-inverse-fg shadow-overlay"
    >
      <p className="min-w-0 truncate">
        <span className="font-medium">{n.titulo}</span>
        {n.detalhe && <span className="opacity-60"> · {n.detalhe}</span>}
      </p>
      <BotaoDaAcao
        n={n}
        onFechar={onFechar}
        className="shrink-0 rounded-full px-2 py-1 font-semibold text-inverse-fg underline-offset-2 hover:underline"
      />
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar"
        className="grid size-7 shrink-0 place-items-center rounded-full opacity-60 transition-opacity hover:opacity-100"
      >
        <X size={14} aria-hidden="true" />
      </button>
    </div>
  );
}
