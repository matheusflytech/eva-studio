"use client";

import * as React from "react";
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
        titulo: dados.esperando - antes === 1 ? "Uma pessoa quer falar com a equipe" : `${dados.esperando - antes} pessoas querem falar com a equipe`,
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

  return (
    <div
      ref={ref}
      role="status"
      aria-live="polite"
      className={cn(
        "relative z-20 inline-flex items-center overflow-hidden bg-black text-[#f2f2f4] shadow-[0_0_0_1px_rgba(255,255,255,0.06),0_6px_20px_rgba(0,0,0,0.25)]",
        "transition-[height,border-radius,padding,gap] duration-500 ease-[cubic-bezier(.34,1.3,.5,1)] motion-reduce:transition-none",
        aberta ? "h-[52px] gap-3 rounded-[26px] pl-2.5 pr-2" : "h-[30px] gap-2 rounded-full pl-3 pr-3.5",
        className
      )}
    >
      {aberta ? (
        <>
          {aviso.avatar && (
            <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-[#2a2a2e] text-[11px] font-semibold">{aviso.avatar}</span>
          )}
          <span className="flex min-w-0 flex-col leading-tight">
            <b className="truncate text-small font-semibold">{aviso.titulo}</b>
            {aviso.detalhe && <span className="truncate text-caption text-[#8a8a90]">{aviso.detalhe}</span>}
          </span>
          {aviso.acao &&
            (aviso.acao.href ? (
              <Link href={aviso.acao.href} onClick={() => setAviso(null)} className="ml-2 inline-flex h-[34px] shrink-0 items-center rounded-full bg-[#f2f2f4] px-3.5 text-small font-semibold text-[#111113]">
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
        </>
      ) : (
        <Link href={esperando > 0 ? "/conversas" : "/inicio"} className="inline-flex items-center gap-2 text-small font-medium">
          <span className={cn("h-[7px] w-[7px] shrink-0 rounded-full", esperando > 0 ? "bg-[#f07a7a]" : "bg-[#7ab8ff]")} aria-hidden="true" />
          {resumo === null ? (
            <span className="text-[#8a8a90]">Eva</span>
          ) : esperando > 0 ? (
            <>
              {esperando} esperando<span className="font-mono text-caption text-[#8a8a90]">Caixa de entrada</span>
            </>
          ) : (
            <>Tudo em dia</>
          )}
        </Link>
      )}
    </div>
  );
}
