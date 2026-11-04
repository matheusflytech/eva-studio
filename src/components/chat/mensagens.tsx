"use client";

import * as React from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Copy } from "lucide-react";
import { MarcaEva } from "@/components/layout/marca-eva";
import { blocosDaResposta } from "@/lib/chat/resposta";
import { cn } from "@/lib/utils";

// Peças das mensagens do chat da Eva: bolha da pessoa, resposta da Eva (com
// números em destaque e digitação que aparece aos poucos) e o "pensando".

const CARACTERES_POR_SEGUNDO = 260;

export function BolhaDaPessoa({ texto }: { texto: string }) {
  const reduz = useReducedMotion();
  return (
    <motion.p
      initial={reduz ? false : { opacity: 0, y: 10, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", bounce: 0.2, visualDuration: 0.35 }}
      style={{ originX: 1, originY: 1 }}
      className="max-w-[86%] self-end whitespace-pre-wrap break-words rounded-[18px] rounded-br-[6px] bg-gradient-to-br from-[#2563eb] to-[#6d4cff] px-3.5 py-2 text-small leading-relaxed text-white shadow-[0_6px_18px_-8px_rgba(80,90,255,0.7)]"
    >
      {texto}
    </motion.p>
  );
}

/** Mostra o texto aos poucos; clicar na resposta mostra tudo. */
function useDigitando(texto: string, ativo: boolean, aoAvancar?: () => void) {
  const [n, setN] = React.useState(0);
  const avancar = React.useRef(aoAvancar);
  React.useEffect(() => {
    avancar.current = aoAvancar;
  });
  React.useEffect(() => {
    if (!ativo) return;
    const inicio = performance.now();
    let quadro = 0;
    const passo = (agora: number) => {
      const alvo = Math.min(texto.length, Math.floor(((agora - inicio) / 1000) * CARACTERES_POR_SEGUNDO));
      setN(alvo);
      avancar.current?.();
      if (alvo < texto.length) quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(quadro);
  }, [texto, ativo]);
  const visivel = ativo ? texto.slice(0, n) : texto;
  return { visivel, pronto: visivel.length >= texto.length, mostrarTudo: () => setN(texto.length) };
}

export function RespostaDaEva({ texto, animar, aoAvancar }: { texto: string; animar: boolean; aoAvancar?: () => void }) {
  const reduz = useReducedMotion();
  const { visivel, pronto, mostrarTudo } = useDigitando(texto, animar && !reduz, aoAvancar);
  const [copiado, setCopiado] = React.useState(false);
  const blocos = React.useMemo(() => blocosDaResposta(visivel), [visivel]);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 1600);
    } catch {
      // Sem permissão para a área de transferência: o texto continua selecionável.
    }
  }

  return (
    <motion.div
      initial={reduz ? false : { opacity: 0, y: 10, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: "spring", bounce: 0.2, visualDuration: 0.4 }}
      style={{ originX: 0, originY: 1 }}
      className="group/resposta flex max-w-[94%] items-end gap-2 self-start"
    >
      <span className="mb-1 grid size-6 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#6eaaff]/25 to-[#c391ff]/25 text-text-primary ring-1 ring-border-subtle">
        <MarcaEva size={12} />
      </span>
      <div className="min-w-0">
        <div
          onClick={pronto ? undefined : mostrarTudo}
          className="rounded-[18px] rounded-bl-[6px] border border-border-subtle bg-raised/70 px-3.5 py-2.5 text-small leading-relaxed text-text-primary backdrop-blur-md"
        >
          <span className="sr-only">{texto}</span>
          <div aria-hidden="true" className="flex flex-col gap-1">
            {blocos.map((b, i) =>
              b.tipo === "espaco" ? (
                <span key={i} className="h-1.5" />
              ) : b.tipo === "p" ? (
                <p key={i}>{b.partes.map(Destaque)}</p>
              ) : (
                <p key={i} className="flex gap-2">
                  <span className="mt-[0.55em] size-1.5 shrink-0 rounded-full bg-gradient-to-br from-[#6eaaff] to-[#c391ff]" />
                  <span className="min-w-0">
                    {b.rotulo && <span className="text-text-secondary">{b.rotulo}: </span>}
                    {b.partes.map(Destaque)}
                  </span>
                </p>
              )
            )}
            {!pronto && <span className="inline-block h-4 w-0.5 animate-pulse bg-accent-fg" />}
          </div>
        </div>
        {pronto && (
          <button
            type="button"
            onClick={copiar}
            aria-label={copiado ? "Resposta copiada" : "Copiar a resposta"}
            className="mt-1 ml-1 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-caption text-text-tertiary opacity-0 transition-opacity hover:text-text-primary focus-visible:opacity-100 group-hover/resposta:opacity-100 [@media(hover:none)]:opacity-100"
          >
            {copiado ? <Check size={12} aria-hidden /> : <Copy size={12} aria-hidden />}
            {copiado ? "Copiado" : "Copiar"}
          </button>
        )}
      </div>
    </motion.div>
  );
}

function Destaque(p: { texto: string; destaque: boolean }, i: number) {
  return p.destaque ? (
    <b key={i} className="font-semibold tabular-nums text-text-primary">
      {p.texto}
    </b>
  ) : (
    <React.Fragment key={i}>{p.texto}</React.Fragment>
  );
}

const FRASES = ["Consultando os dados...", "Cruzando funis e etapas...", "Conferindo os números...", "Montando a resposta..."];

/** Três pontos que ondulam e uma frase que troca, para quem espera saber que está andando. */
export function Pensando() {
  const reduz = useReducedMotion();
  const [i, setI] = React.useState(0);
  React.useEffect(() => {
    const t = window.setInterval(() => setI((v) => (v + 1) % FRASES.length), 2200);
    return () => window.clearInterval(t);
  }, []);
  return (
    <motion.div
      initial={reduz ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-2.5 self-start pl-8 text-small text-text-tertiary"
      role="status"
    >
      <span className="flex items-end gap-1" aria-hidden="true">
        {[0, 1, 2].map((d) => (
          <motion.span
            key={d}
            className="size-1.5 rounded-full bg-gradient-to-br from-[#6eaaff] to-[#c391ff]"
            animate={reduz ? undefined : { y: [0, -5, 0], opacity: [0.45, 1, 0.45] }}
            transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.14, ease: "easeInOut" }}
          />
        ))}
      </span>
      <span className={cn("transition-opacity")}>{FRASES[i]}</span>
    </motion.div>
  );
}
