"use client";

import * as React from "react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "@/components/contrato/link";
import { useSondagem } from "@/components/inbox/use-sondagem";
import { EVENTO_ILHA, pulsar, type AvisoDaIlha } from "@/lib/fundo/eventos";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Ilha dinâmica: cápsula preta no topo da área de conteúdo.
//
// Fechada, mostra o que pede atenção agora (quantas pessoas esperam
// atendimento). Aberta, mostra um acontecimento com uma ação: chegou alguém
// esperando (Atender), ou o que qualquer tela mandar por `avisarNaIlha()`
// (Desfazer, Abrir...). Volta a fechar sozinha.
// ---------------------------------------------------------------------------

interface Resumo {
  esperando: number;
  naoLidas: number;
}

export function Ilha({ className }: { className?: string }) {
  const [resumo, setResumo] = React.useState<Resumo | null>(null);
  const [aviso, setAviso] = React.useState<AvisoDaIlha | null>(null);
  const anterior = React.useRef<number | null>(null);
  const ref = React.useRef<HTMLDivElement>(null);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const abrir = React.useCallback((a: AvisoDaIlha) => {
    setAviso(a);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setAviso(null), a.duracao ?? 4000);
    requestAnimationFrame(() => pulsar(ref.current, 1.4));
  }, []);

  useSondagem(async () => {
    const res = await fetch("/api/inbox/summary");
    if (!res.ok) return;
    const dados = (await res.json()) as Resumo;
    setResumo(dados);
    const antes = anterior.current;
    if (antes !== null && dados.esperando > antes) {
      abrir({
        titulo:
          dados.esperando - antes === 1
            ? "Uma pessoa quer falar com a equipe"
            : `${dados.esperando - antes} pessoas querem falar com a equipe`,
        detalhe: "o agente passou a conversa",
        acao: { rotulo: "Atender", href: "/conversas" },
      });
    }
    anterior.current = dados.esperando;
  }, 20_000);

  React.useEffect(() => {
    const aoAviso = (e: Event) => abrir((e as CustomEvent<AvisoDaIlha>).detail);
    window.addEventListener(EVENTO_ILHA, aoAviso);
    return () => {
      window.removeEventListener(EVENTO_ILHA, aoAviso);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [abrir]);

  const esperando = resumo?.esperando ?? 0;
  const aberta = aviso !== null;

  // A cápsula muda de tamanho com mola (layout do framer: largura e altura
  // juntas, sem animar width/height de verdade); o conteúdo troca com um
  // desfoque curto por cima.
  return (
    <motion.div
      ref={ref}
      layout
      role="status"
      aria-live="polite"
      transition={MOLA}
      style={{ borderRadius: aberta ? 26 : 15 }}
      className={cn(
        "relative z-20 inline-flex items-center overflow-hidden bg-black text-[#f2f2f4] shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_6px_20px_rgba(0,0,0,0.25)]",
        aberta ? "h-[52px] pl-2.5 pr-2" : "h-[30px] pl-3 pr-3.5",
        className,
      )}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {aberta ? (
          <motion.span
            key={`aviso-${aviso.titulo}`}
            {...TROCA}
            className="flex items-center gap-3"
          >
            {aviso.avatar && (
              <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-[#2a2a2e] text-[11px] font-semibold">
                {aviso.avatar}
              </span>
            )}
            <span className="flex min-w-0 flex-col leading-tight">
              <b className="truncate text-small font-semibold">
                {aviso.titulo}
              </b>
              {aviso.detalhe && (
                <span className="truncate text-caption text-[#8a8a90]">
                  {aviso.detalhe}
                </span>
              )}
            </span>
            {aviso.acao &&
              (aviso.acao.href ? (
                <Link
                  href={aviso.acao.href}
                  onClick={() => setAviso(null)}
                  className="ml-2 inline-flex h-[34px] shrink-0 items-center rounded-full bg-[#f2f2f4] px-3.5 text-small font-semibold text-[#111113]"
                >
                  {aviso.acao.rotulo}
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    aviso.acao?.aoClicar?.();
                    setAviso(null);
                  }}
                  className="ml-2 inline-flex h-[34px] shrink-0 items-center rounded-full bg-[#f2f2f4] px-3.5 text-small font-semibold text-[#111113]"
                >
                  {aviso.acao.rotulo}
                </button>
              ))}
          </motion.span>
        ) : (
          <motion.span key="resumo" {...TROCA} className="inline-flex">
            <Link
              href={esperando > 0 ? "/conversas" : "/inicio"}
              className="inline-flex items-center gap-2 text-small font-medium"
            >
              <span
                className={cn(
                  "h-[7px] w-[7px] shrink-0 rounded-full",
                  esperando > 0 ? "bg-[#f07a7a]" : "bg-[#7ab8ff]",
                )}
                aria-hidden="true"
              />
              {resumo === null ? (
                <span className="text-[#8a8a90]">Eva</span>
              ) : esperando > 0 ? (
                <>
                  {esperando} esperando
                  <span className="font-mono text-caption text-[#8a8a90]">
                    Caixa de entrada
                  </span>
                </>
              ) : (
                <>Tudo em dia</>
              )}
            </Link>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

const MOLA = {
  type: "spring",
  stiffness: 420,
  damping: 32,
  mass: 0.9,
} as const;

const TROCA = {
  layout: "position",
  initial: { opacity: 0, filter: "blur(6px)", scale: 0.96 },
  animate: { opacity: 1, filter: "blur(0px)", scale: 1 },
  exit: {
    opacity: 0,
    filter: "blur(6px)",
    scale: 0.96,
    transition: { duration: 0.12 },
  },
  transition: { duration: 0.28, ease: [0.32, 0.72, 0, 1] },
} as const;
