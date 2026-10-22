"use client";

import * as React from "react";
import { useCanvasTheme, useTheme } from "@/components/ui/theme";
import { focusRing } from "@/components/ui/styles";
import { pulsar } from "@/lib/fundo/eventos";
import { cn } from "@/lib/utils";
import type { CanvasPreference, ThemePreference } from "@/lib/design-system/theme";

// ---------------------------------------------------------------------------
// Tema escolhido vendo o resultado: cada opção é uma miniatura do próprio app.
// As miniaturas não têm cor solta: cada metade leva data-theme="light|dark" e
// os tokens se resolvem no tema daquela metade (globals.css repinta qualquer
// elemento com data-theme). A gravação é a mesma de antes (useTheme e
// useCanvasTheme): vale só neste navegador.
// ---------------------------------------------------------------------------

/** Menu lateral + conteúdo, num tema fixo. */
function MiniaturaDoApp({ tema }: { tema: "light" | "dark" }) {
  return (
    <span data-theme={tema} className="absolute inset-0 flex bg-page">
      <span className="flex w-[30%] flex-col gap-1.5 bg-panel px-1.5 pt-[18px]">
        <i className="block h-1 rounded-full bg-hover" />
        <i className="block h-1 rounded-full bg-hover" />
        <i className="block h-1 rounded-full bg-hover" />
        <i className="block h-1 rounded-full bg-hover" />
      </span>
      <span className="flex flex-1 flex-col gap-1.5 px-2 pt-[18px] pb-2.5">
        <i className="block h-1.5 w-1/2 rounded-full bg-text-primary" />
        <i className="block h-1.5 w-4/5 rounded-full bg-hover" />
        <u className="block flex-1 rounded-md bg-raised" />
      </span>
    </span>
  );
}

/** Quadro de fluxo: pontos e três caixinhas ligadas. */
function MiniaturaDoCanvas({ tema }: { tema: "light" | "dark" }) {
  return (
    <span
      data-theme={tema}
      className="absolute inset-0 bg-page bg-[radial-gradient(var(--border-default)_1px,transparent_1.2px)] bg-[length:10px_10px]"
    >
      <b className="absolute left-[11%] top-[44%] h-[26%] w-[30%] rounded-md bg-panel ring-1 ring-border-default" />
      <b className="absolute left-[52%] top-[44%] h-[26%] w-[30%] rounded-md bg-panel ring-1 ring-border-default" />
      <s className="absolute left-[41%] top-[57%] h-px w-[11%] bg-accent-solid" />
    </span>
  );
}

function Bolinhas() {
  return (
    <span aria-hidden="true" className="absolute left-[7px] top-[6px] z-10 flex gap-[3px]">
      <em className="h-[5px] w-[5px] rounded-full bg-text-tertiary opacity-60" />
      <em className="h-[5px] w-[5px] rounded-full bg-text-tertiary opacity-60" />
      <em className="h-[5px] w-[5px] rounded-full bg-text-tertiary opacity-60" />
    </span>
  );
}

interface Opcao<T extends string> {
  valor: T;
  rotulo: string;
  desenho: React.ReactNode;
}

/** Grupo de rádio com miniaturas. Setas trocam, a escolhida ganha o anel. */
function EscolhaComMiniatura<T extends string>({
  rotulo,
  opcoes,
  valor,
  mudar,
}: {
  rotulo: string;
  opcoes: Opcao<T>[];
  valor: T;
  mudar: (v: T) => void;
}) {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  function escolher(v: T, el: HTMLElement | null) {
    if (v === valor) return;
    mudar(v);
    pulsar(el, 1.2);
  }
  return (
    <div role="radiogroup" aria-label={rotulo} className="flex flex-wrap gap-3">
      {opcoes.map((o, i) => {
        const ativo = o.valor === valor;
        return (
          <button
            key={o.valor}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={ativo}
            tabIndex={ativo ? 0 : -1}
            onClick={(e) => escolher(o.valor, e.currentTarget)}
            onKeyDown={(e) => {
              if (!["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp"].includes(e.key)) return;
              e.preventDefault();
              const passo = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
              const j = (i + passo + opcoes.length) % opcoes.length;
              escolher(opcoes[j].valor, refs.current[j]);
              refs.current[j]?.focus();
            }}
            className={cn(
              "group flex flex-col gap-2 rounded-[14px] text-left text-small font-medium",
              ativo ? "text-text-primary" : "text-text-secondary hover:text-text-primary",
              focusRing
            )}
          >
            <span
              className={cn(
                "relative block h-[84px] w-[128px] overflow-hidden rounded-[12px] transition-shadow duration-200",
                ativo
                  ? "ring-2 ring-text-primary ring-offset-2 ring-offset-page"
                  : "ring-1 ring-border-default group-hover:ring-border-strong"
              )}
            >
              {o.desenho}
            </span>
            {o.rotulo}
          </button>
        );
      })}
    </div>
  );
}

const OPCOES_DE_TEMA: Opcao<ThemePreference>[] = [
  {
    valor: "light",
    rotulo: "Claro",
    desenho: (
      <>
        <MiniaturaDoApp tema="light" />
        <Bolinhas />
      </>
    ),
  },
  {
    valor: "dark",
    rotulo: "Escuro",
    desenho: (
      <>
        <MiniaturaDoApp tema="dark" />
        <Bolinhas />
      </>
    ),
  },
  {
    valor: "system",
    rotulo: "Seguir o sistema",
    // Metade clara, metade escura, cortadas na diagonal.
    desenho: (
      <>
        <MiniaturaDoApp tema="light" />
        <span className="absolute inset-0 [clip-path:polygon(100%_0,100%_100%,0_100%)]">
          <MiniaturaDoApp tema="dark" />
        </span>
        <Bolinhas />
      </>
    ),
  },
];

const OPCOES_DE_CANVAS: Opcao<CanvasPreference>[] = [
  { valor: "tema", rotulo: "Acompanhar o tema", desenho: null },
  { valor: "escuro", rotulo: "Sempre escuro", desenho: <MiniaturaDoCanvas tema="dark" /> },
];

/** Claro, Escuro ou Seguir o sistema (Configurações → Sua conta). */
export function EscolhaDeTema() {
  const { preference, setPreference } = useTheme();
  return <EscolhaComMiniatura rotulo="Tema da interface" opcoes={OPCOES_DE_TEMA} valor={preference} mudar={setPreference} />;
}

/** Canvas do builder: acompanha o tema do app ou fica sempre escuro. */
export function EscolhaDeCanvas() {
  const { preference, setPreference } = useCanvasTheme();
  const { resolved } = useTheme();
  // "Acompanhar o tema" desenha o canvas no tema que está valendo agora.
  const opcoes = OPCOES_DE_CANVAS.map((o) => (o.valor === "tema" ? { ...o, desenho: <MiniaturaDoCanvas tema={resolved} /> } : o));
  return <EscolhaComMiniatura rotulo="Canvas do builder" opcoes={opcoes} valor={preference} mudar={setPreference} />;
}
