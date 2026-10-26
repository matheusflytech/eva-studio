"use client";

import * as React from "react";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";

const BARRAS = 32;
const VELOCIDADES = [1, 1.5, 2] as const;

/**
 * Alturas da onda (0,25 a 1), sempre as mesmas para o mesmo áudio.
 * shortcut: onda desenhada a partir do id, não do som; trocar por decodeAudioData se pedirem a onda real.
 */
export function alturasDaOnda(semente: string, n = BARRAS): number[] {
  let h = 2166136261;
  for (let i = 0; i < semente.length; i++) h = Math.imul(h ^ semente.charCodeAt(i), 16777619);
  return Array.from({ length: n }, () => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return 0.25 + ((h >>> 0) % 1000) / 1333;
  });
}

const relogio = (s: number) => (Number.isFinite(s) && s >= 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00");

/** Player de mensagem de voz: play redondo, onda que enche com o progresso, toque na onda para pular e velocidade. */
export function PlayerDeAudio({ url, semente, claro }: { url: string; semente: string; /** Dentro do balão azul. */ claro?: boolean }) {
  const ref = React.useRef<HTMLAudioElement>(null);
  const [tocando, setTocando] = React.useState(false);
  const [atual, setAtual] = React.useState(0);
  const [duracao, setDuracao] = React.useState(0);
  const [velocidade, setVelocidade] = React.useState<(typeof VELOCIDADES)[number]>(1);
  const alturas = React.useMemo(() => alturasDaOnda(semente), [semente]);
  const progresso = duracao > 0 ? Math.min(atual / duracao, 1) : 0;

  function alternar() {
    const a = ref.current;
    if (!a) return;
    if (a.paused) void a.play().catch(() => setTocando(false));
    else a.pause();
  }

  function pular(fracao: number) {
    const a = ref.current;
    if (!a || !(duracao > 0)) return;
    a.currentTime = Math.max(0, Math.min(fracao, 1)) * duracao;
    setAtual(a.currentTime);
  }

  function trocarVelocidade() {
    const nova = VELOCIDADES[(VELOCIDADES.indexOf(velocidade) + 1) % VELOCIDADES.length];
    setVelocidade(nova);
    if (ref.current) ref.current.playbackRate = nova;
  }

  return (
    <div className="flex w-[260px] max-w-full items-center gap-2.5 py-0.5">
      <audio
        ref={ref}
        src={url}
        preload="metadata"
        onPlay={() => setTocando(true)}
        onPause={() => setTocando(false)}
        onEnded={() => {
          setTocando(false);
          setAtual(0);
        }}
        onTimeUpdate={(e) => setAtual(e.currentTarget.currentTime)}
        // Gravação do navegador às vezes chega sem duração (Infinity) até tocar inteira.
        onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuracao(e.currentTarget.duration)}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuracao(e.currentTarget.duration)}
      />
      <button
        type="button"
        onClick={alternar}
        aria-label={tocando ? "Pausar áudio" : "Tocar áudio"}
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-full transition-transform active:scale-95",
          claro ? "bg-text-on-accent text-accent-solid" : "bg-accent-solid text-text-on-accent"
        )}
      >
        {tocando ? <Pause size={16} fill="currentColor" aria-hidden="true" /> : <Play size={16} fill="currentColor" className="ml-0.5" aria-hidden="true" />}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div
          role="slider"
          tabIndex={0}
          aria-label="Posição do áudio"
          aria-valuemin={0}
          aria-valuemax={Math.round(duracao)}
          aria-valuenow={Math.round(atual)}
          aria-valuetext={`${relogio(atual)} de ${relogio(duracao)}`}
          onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            pular((e.clientX - r.left) / r.width);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") pular(progresso + 0.05);
            else if (e.key === "ArrowLeft") pular(progresso - 0.05);
            else return;
            e.preventDefault();
          }}
          className="flex h-7 cursor-pointer items-center gap-[2px] rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          {alturas.map((a, i) => (
            <span
              key={i}
              aria-hidden="true"
              style={{ height: `${a * 100}%` }}
              className={cn(
                "w-[3px] flex-1 rounded-full transition-colors",
                (i + 0.5) / alturas.length <= progresso
                  ? claro ? "bg-text-on-accent" : "bg-accent-solid"
                  : claro ? "bg-text-on-accent/35" : "bg-text-tertiary/40"
              )}
            />
          ))}
        </div>
        <div className={cn("flex items-center justify-between text-caption tabular-nums", claro ? "text-text-on-accent/75" : "text-text-tertiary")}>
          <span className="font-mono">{relogio(tocando || atual > 0 ? atual : duracao)}</span>
          <button
            type="button"
            onClick={trocarVelocidade}
            aria-label={`Velocidade ${velocidade}x`}
            className={cn(
              "rounded-full px-1.5 font-mono font-medium leading-5",
              claro ? "bg-text-on-accent/20 hover:bg-text-on-accent/30" : "bg-hover hover:bg-border-subtle"
            )}
          >
            {String(velocidade).replace(".", ",")}x
          </button>
        </div>
      </div>
    </div>
  );
}
