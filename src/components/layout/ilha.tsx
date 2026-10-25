"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { X } from "lucide-react";
import Link from "@/components/contrato/link";
import { useSondagem } from "@/components/inbox/use-sondagem";
import { EVENTO_ILHA, pulsar, type AvisoDaIlha } from "@/lib/fundo/eventos";
import { cn } from "@/lib/utils";
import { MOLA } from "@/lib/design-system/movimento";

// ---------------------------------------------------------------------------
// Notificações (antes "ilha"): como as do iPhone. Não há nada fixo no topo;
// quando acontece algo (alguém passou a esperar atendimento, ou qualquer tela
// chama `avisarNaIlha()`: Desfazer, compromisso em 10 min...), um cartão de
// vidro desce do topo, fica alguns segundos e sobe sozinho. Chegando outra,
// a nova vem por cima e as anteriores ficam empilhadas atrás (até 3).
// Arrastar para cima dispensa; passar o mouse segura o tempo.
// ---------------------------------------------------------------------------

interface Resumo {
  esperando: number;
  naoLidas: number;
}

interface Notificacao extends AvisoDaIlha {
  id: number;
  em: Date;
}

/** Quantas aparecem na pilha (as mais antigas além disso somem). */
const NA_PILHA = 3;

export function Ilha({ className }: { className?: string }) {
  const reduzir = useReducedMotion();
  const [lista, setLista] = React.useState<Notificacao[]>([]);
  const [segurando, setSegurando] = React.useState(false);
  const anterior = React.useRef<number | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
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
      const n: Notificacao = { ...a, id: ++proximoId.current, em: new Date() };
      setLista((l) => [n, ...l].slice(0, NA_PILHA));
      agendar(n);
      requestAnimationFrame(() => pulsar(ref.current, 1.2));
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
    <div
      ref={ref}
      role="region"
      aria-label="Notificações"
      aria-live="polite"
      className={cn("pointer-events-none absolute inset-x-0 top-3 z-50 flex justify-center px-4", className)}
      data-print-ocultar
    >
      <div className="relative w-full max-w-[440px]" onMouseEnter={() => setSegurando(true)} onMouseLeave={() => setSegurando(false)}>
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
              <CartaoDeNotificacao notificacao={n} onFechar={() => dispensar(n.id)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CartaoDeNotificacao({ notificacao: n, onFechar }: { notificacao: Notificacao; onFechar: () => void }) {
  const botao = "inline-flex h-8 shrink-0 items-center rounded-full bg-inverse px-3.5 text-small font-semibold text-inverse-fg transition-opacity hover:opacity-90";
  return (
    <div
      role="status"
      className="group/notificacao relative flex cursor-grab items-center gap-3 rounded-[22px] border border-white/40 bg-overlay/80 p-3 pr-3.5 shadow-[0_12px_40px_rgba(0,0,0,0.18),0_2px_8px_rgba(0,0,0,0.08)] backdrop-blur-2xl backdrop-saturate-150 active:cursor-grabbing dark:border-white/10"
    >
      {n.avatar ? (
        <span className="grid size-[38px] shrink-0 place-items-center rounded-full bg-raised text-caption font-semibold text-text-primary">{n.avatar}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src="/eva-mark.png" alt="" className="size-[38px] shrink-0 rounded-[10px] bg-inverse object-contain p-1.5" draggable={false} />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-baseline gap-2">
          <p className="min-w-0 flex-1 truncate text-small font-semibold text-text-primary">{n.titulo}</p>
          <span className="shrink-0 text-caption text-text-tertiary">agora</span>
        </div>
        {n.detalhe && <p className="line-clamp-2 text-small leading-snug text-text-secondary">{n.detalhe}</p>}
      </div>
      {n.acao &&
        (n.acao.href ? (
          <Link href={n.acao.href} onClick={onFechar} className={botao}>
            {n.acao.rotulo}
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => {
              n.acao?.aoClicar?.();
              onFechar();
            }}
            className={botao}
          >
            {n.acao.rotulo}
          </button>
        ))}
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

