"use client";

import { FundoGelo } from "@/components/entrada/fundo-gelo";
import { useTheme } from "@/components/ui/theme";

/**
 * Montanhas de gelo bem desfocadas atrás da casca, nos dois temas. O desenho é
 * estático (feito uma vez); o desfoque é do navegador. A escala esconde a
 * borda clara que o blur deixa nas pontas.
 */
export function FundoDeMontanhas() {
  const escuro = useTheme().resolved === "dark";
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      <FundoGelo escuro={escuro} className="h-full w-full scale-110 blur-[9px]" />
    </div>
  );
}
