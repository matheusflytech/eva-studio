"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { fieldBase, focusRing, overlayBox } from "./styles";

/*
 * Intervalo de datas num calendário de verdade (no lugar do input nativo,
 * que muda de cara em cada navegador). Primeiro clique marca o início, o
 * segundo o fim; clicar antes do início recomeça. Datas em "AAAA-MM-DD".
 */

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

const iso = (a: number, m: number, d: number) => `${a}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const br = (s: string) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : "");

/** Dias do mês com os buracos do começo (semana começa no domingo). */
export function diasDoMes(ano: number, mes: number): (number | null)[] {
  const primeiro = new Date(Date.UTC(ano, mes, 1)).getUTCDay();
  const total = new Date(Date.UTC(ano, mes + 1, 0)).getUTCDate();
  return [...Array<null>(primeiro).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
}

export function DateRangePicker({
  de,
  ate,
  onChange,
  label = "Período",
  className,
}: {
  de: string;
  ate: string;
  onChange: (de: string, ate: string) => void;
  label?: string;
  className?: string;
}) {
  const hoje = new Date();
  const [aberto, setAberto] = React.useState(false);
  const [vista, setVista] = React.useState(() => {
    const base = de ? new Date(`${de}T12:00:00`) : hoje;
    return { ano: base.getFullYear(), mes: base.getMonth() };
  });
  const [inicio, setInicio] = React.useState<string>("");
  const [sobre, setSobre] = React.useState<string>("");
  const hojeIso = iso(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

  function andar(n: number) {
    setVista((v) => {
      const d = new Date(v.ano, v.mes + n, 1);
      return { ano: d.getFullYear(), mes: d.getMonth() };
    });
  }

  function clicar(dia: string) {
    if (!inicio || dia < inicio) {
      setInicio(dia);
      return;
    }
    onChange(inicio, dia);
    setInicio("");
    setAberto(false);
  }

  // Enquanto escolhe o fim, o trecho acompanha o mouse; senão mostra o salvo.
  const a = inicio || de;
  const b = inicio ? (sobre && sobre >= inicio ? sobre : inicio) : ate;
  const texto = de && ate ? `${br(de)} – ${br(ate)}` : "Escolher datas";

  return (
    <DropdownMenuPrimitive.Root
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        setInicio("");
      }}
    >
      <DropdownMenuPrimitive.Trigger
        aria-label={`${label}: ${texto}`}
        className={cn(fieldBase, "inline-flex h-9 items-center gap-2 px-3 text-left text-small tabular-nums", !de && "text-text-tertiary", className)}
      >
        <CalendarDays size={14} aria-hidden className="shrink-0 text-text-tertiary" />
        <span className="truncate">{texto}</span>
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content align="start" sideOffset={6} className={cn(overlayBox, "w-[264px] p-3")}>
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => andar(-1)} aria-label="Mês anterior" className={cn("grid size-7 place-items-center rounded-md text-text-tertiary hover:bg-hover hover:text-text-primary", focusRing)}>
              <ChevronLeft size={15} />
            </button>
            <p className="text-small font-medium capitalize text-text-primary" aria-live="polite">
              {MESES[vista.mes]} {vista.ano}
            </p>
            <button type="button" onClick={() => andar(1)} aria-label="Próximo mês" className={cn("grid size-7 place-items-center rounded-md text-text-tertiary hover:bg-hover hover:text-text-primary", focusRing)}>
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-caption text-text-tertiary" aria-hidden>
            {SEMANA.map((s, i) => <span key={i} className="py-1">{s}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5" onMouseLeave={() => setSobre("")}>
            {diasDoMes(vista.ano, vista.mes).map((d, i) => {
              if (d === null) return <span key={`v${i}`} />;
              const dia = iso(vista.ano, vista.mes, d);
              const ponta = dia === a || dia === b;
              const dentro = !!a && !!b && dia > a && dia < b;
              return (
                <button
                  key={dia}
                  type="button"
                  onClick={() => clicar(dia)}
                  onMouseEnter={() => setSobre(dia)}
                  onFocus={() => setSobre(dia)}
                  aria-label={br(dia)}
                  aria-pressed={ponta}
                  className={cn(
                    "h-8 text-small tabular-nums transition-colors",
                    focusRing,
                    ponta ? "rounded-md bg-accent-solid font-medium text-text-on-accent" : dentro ? "bg-accent-subtle text-accent-fg" : "rounded-md text-text-primary hover:bg-hover",
                    dia === hojeIso && !ponta && "font-semibold underline underline-offset-4"
                  )}
                >
                  {d}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-caption text-text-tertiary">{inicio ? "Agora clique no último dia." : "Clique no primeiro dia."}</p>
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}
