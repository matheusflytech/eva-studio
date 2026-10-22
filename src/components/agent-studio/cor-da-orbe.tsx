"use client";

import * as React from "react";
import { Check } from "lucide-react";
import { Popover } from "@/components/dashboard/seletor-multiplo";
import { Button } from "@/components/ui/button";
import { fieldBase, focusRing } from "@/components/ui/styles";
import { cn } from "@/lib/utils";
import { PALETA_DA_ORBE, normalizarHex, useCorDoAgente } from "./cor-do-agente";

// ---------------------------------------------------------------------------
// Escolha da cor da orbe: paleta pronta (cores da v5) + cor livre (RGB pelo
// seletor nativo ou hex digitado) + voltar ao padrão (cor tirada do id).
// A escolha vale na hora para todas as orbes do agente na página.
// ---------------------------------------------------------------------------

/** O conteúdo da escolha, sem moldura (cabe num popover ou num painel). */
export function PaletaDaOrbe({ agenteId, className }: { agenteId: string; className?: string }) {
  const { cor, personalizada, definir } = useCorDoAgente(agenteId);
  const [rascunho, setRascunho] = React.useState(cor);
  const idHex = React.useId();

  // a cor mudou por fora (outra orbe, outra aba, a paleta): o campo acompanha
  const [corAnterior, setCorAnterior] = React.useState(cor);
  if (corAnterior !== cor) {
    setCorAnterior(cor);
    setRascunho(cor);
  }

  const valido = normalizarHex(rascunho);
  const aplicarRascunho = () => {
    if (valido) definir(valido);
    else setRascunho(cor);
  };

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div role="radiogroup" aria-label="Cores prontas" className="grid grid-cols-5 justify-items-center gap-2">
        {PALETA_DA_ORBE.map((c) => {
          const marcada = c.hex === cor;
          return (
            <button
              key={c.hex}
              type="button"
              role="radio"
              aria-checked={marcada}
              aria-label={c.nome}
              title={c.nome}
              onClick={() => definir(c.hex)}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full border border-border-subtle transition-transform duration-120 hover:scale-110 motion-reduce:hover:scale-100",
                marcada && "ring-2 ring-text-primary ring-offset-2 ring-offset-overlay",
                focusRing
              )}
              // cor de dado do usuário: só dá para passar como estilo
              style={{ background: `radial-gradient(circle at 35% 30%, rgba(255,255,255,.33), transparent 55%), ${c.hex}` }}
            >
              {marcada && <Check size={14} aria-hidden="true" className="text-text-on-accent drop-shadow" />}
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor={idHex} className="text-caption text-text-tertiary">
          Cor livre
        </label>
        <div className="flex items-center gap-2">
          <input
            type="color"
            aria-label="Escolher cor livre"
            value={valido ?? cor}
            onChange={(e) => {
              setRascunho(e.target.value);
              definir(e.target.value);
            }}
            className={cn(
              "h-8 w-10 shrink-0 cursor-pointer rounded-[10px] border border-border-subtle bg-raised p-0.5",
              "[&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[7px] [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-[7px] [&::-moz-color-swatch]:border-0",
              focusRing
            )}
          />
          <input
            id={idHex}
            value={rascunho}
            onChange={(e) => setRascunho(e.target.value)}
            onBlur={aplicarRascunho}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                aplicarRascunho();
              }
            }}
            spellCheck={false}
            maxLength={7}
            aria-invalid={!valido}
            placeholder="#1f6fd6"
            className={cn(fieldBase, "h-8 px-2.5 font-mono text-small uppercase")}
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-caption text-text-tertiary">
          {personalizada ? "Só neste navegador, por enquanto." : "Cor padrão do agente."}
        </span>
        {personalizada && (
          <Button variant="ghost" size="sm" onClick={() => definir(null)}>
            Voltar ao padrão
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * Gatilho + popover "Cor da orbe". `children` é o conteúdo do botão (em geral
 * a própria orbe); o botão leva o nome acessível "Cor da orbe".
 */
export function BotaoCorDaOrbe({
  agenteId,
  children,
  className,
}: {
  agenteId: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [aberto, setAberto] = React.useState(false);
  const ancora = React.useRef<HTMLButtonElement>(null);
  const fechar = React.useCallback(() => setAberto(false), []);

  return (
    <>
      <button
        ref={ancora}
        type="button"
        aria-label="Cor da orbe"
        title="Cor da orbe"
        aria-haspopup="dialog"
        aria-expanded={aberto}
        onClick={() => setAberto((a) => !a)}
        className={cn("rounded-full", focusRing, className)}
      >
        {children}
      </button>
      <Popover aberto={aberto} aoFechar={fechar} ancora={ancora} largura={264}>
        <div className="flex flex-col gap-3 p-3.5">
          <span className="text-small font-medium text-text-primary">Cor da orbe</span>
          <PaletaDaOrbe agenteId={agenteId} />
        </div>
      </Popover>
    </>
  );
}
