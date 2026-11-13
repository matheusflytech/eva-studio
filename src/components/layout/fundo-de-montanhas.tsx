"use client";

import { FundoGelo } from "@/components/entrada/fundo-gelo";
import { useTheme } from "@/components/ui/theme";
import { ehAppDeDisparos } from "@/lib/app-variant";

/**
 * Montanhas de gelo bem desfocadas atrás da casca, nos dois temas. O desenho é
 * estático (feito uma vez); o desfoque é do navegador. A escala esconde a
 * borda clara que o blur deixa nas pontas. No escuro viram tons de cinza
 * (preto fosco, sem o tom azulado do gelo).
 */
export function FundoDeMontanhas() {
  const escuro = useTheme().resolved === "dark";
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {/* Disparo: fundo bem mais apagado (o desenho competia com as telas, "sujo"). */}
      <FundoGelo
        escuro={escuro}
        realce={escuro ? 0.8 : 2}
        className={`h-full w-full scale-110 ${ehAppDeDisparos ? "blur-[10px]" : "blur-[6px]"} ${escuro ? `grayscale ${ehAppDeDisparos ? "opacity-25" : "opacity-70"}` : ehAppDeDisparos ? "opacity-40" : ""}`}
      />
    </div>
  );
}
