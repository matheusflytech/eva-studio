"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { amanhaAs, daquiA, deSaoPaulo, formatarSaoPaulo, paraCampoSaoPaulo } from "@/lib/fuso-sp";
import { cn } from "@/lib/utils";

/**
 * Data e hora SEMPRE em horário de São Paulo, qualquer que seja o fuso do
 * navegador. `valor` é o texto do campo ("2026-10-20T09:00"); converta com
 * deSaoPaulo() na hora de mandar pro servidor.
 */
export function CampoDataSP({
  id,
  valor,
  onChange,
  atalhos = true,
}: {
  id?: string;
  valor: string;
  onChange: (valor: string) => void;
  atalhos?: boolean;
}) {
  const instante = valor ? deSaoPaulo(valor) : null;
  const [agora, setAgora] = React.useState<Date | null>(null);
  // Hora atual só no cliente (evita divergência de hidratação) e renovada a cada minuto.
  React.useEffect(() => {
    const primeiro = setTimeout(() => setAgora(new Date()), 0);
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => {
      clearTimeout(primeiro);
      clearInterval(t);
    };
  }, []);

  const opcoes = agora
    ? [
        { rotulo: "Daqui 1h", data: daquiA(60, agora) },
        { rotulo: "Amanhã 9h", data: amanhaAs(9, agora) },
        { rotulo: "Amanhã 14h", data: amanhaAs(14, agora) },
      ]
    : [];

  return (
    <div className="flex flex-col gap-2">
      <Input
        id={id}
        type="datetime-local"
        value={valor}
        min={agora ? paraCampoSaoPaulo(agora) : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {atalhos && opcoes.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {opcoes.map((o) => {
            const v = paraCampoSaoPaulo(o.data);
            return (
              <button
                key={o.rotulo}
                type="button"
                onClick={() => onChange(v)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-[12px] transition-colors",
                  valor === v ? "bg-accent-soft font-medium text-accent-400" : "bg-surface-3 text-text-secondary hover:text-text-primary"
                )}
              >
                {o.rotulo}
              </button>
            );
          })}
        </div>
      )}
      <p className="flex items-center gap-1.5 text-[11.5px] text-text-tertiary">
        <Clock size={11} />
        {instante
          ? <>Sai em <span className="font-medium text-text-secondary">{formatarSaoPaulo(instante)}</span> (horário de São Paulo)</>
          : valor
            ? <span className="text-danger">Data ou hora inválida.</span>
            : "Horário de São Paulo, independente do fuso deste computador."}
      </p>
    </div>
  );
}
