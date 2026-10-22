import * as React from "react";

// Desktop largo (≥1280px): páginas de registro ganham uma coluna lateral fixa
// em vez de esconder dados atrás de uma aba.
const CONSULTA = "(min-width: 1280px)";

function assinar(aoMudar: () => void) {
  const mq = window.matchMedia(CONSULTA);
  mq.addEventListener("change", aoMudar);
  return () => mq.removeEventListener("change", aoMudar);
}

export function useTelaLarga(): boolean {
  return React.useSyncExternalStore(
    assinar,
    () => window.matchMedia(CONSULTA).matches,
    () => false
  );
}
