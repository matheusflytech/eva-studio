"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  estadoParaUrl,
  lerEstadoDaUrl,
  type EstadoDaLista,
  type FiltroDaBarra,
  type PadraoDaLista,
} from "@/lib/listas/estado-da-lista";

/** Parâmetros da URL que pertencem ao estado da lista (o resto é preservado). */
function chavesDoEstado(barra: FiltroDaBarra[]): Set<string> {
  return new Set(["v", "q", "av", "ordem", "p", "pp", ...barra.map((f) => f.param)]);
}

/**
 * Estado da lista guardado na URL (link compartilhável). Ler é derivado de
 * useSearchParams; gravar usa history.replaceState, que o roteador do Next
 * acompanha sem recarregar a página (ver docs do Next: "linking and
 * navigating", window.history). Parâmetros que não são da lista (ex.:
 * ?abrir=, ?funil=) ficam como estão.
 */
export function useEstadoDaLista(
  barra: FiltroDaBarra[],
  padrao: PadraoDaLista,
  visoes?: string[]
): [EstadoDaLista, (novo: EstadoDaLista | ((e: EstadoDaLista) => EstadoDaLista)) => void] {
  const sp = useSearchParams();
  const texto = sp.toString();
  const estado = React.useMemo(
    () => lerEstadoDaUrl(new URLSearchParams(texto), barra, padrao, visoes),
    // barra/padrão/visões são constantes da tela; o texto da URL é o que muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [texto]
  );
  const atual = React.useRef(estado);
  React.useEffect(() => {
    atual.current = estado;
  }, [estado]);

  const gravar = React.useCallback(
    (novo: EstadoDaLista | ((e: EstadoDaLista) => EstadoDaLista)) => {
      const proximo = typeof novo === "function" ? novo(atual.current) : novo;
      atual.current = proximo;
      const minhas = chavesDoEstado(barra);
      const saida = estadoParaUrl(proximo, barra, padrao);
      for (const [k, v] of new URLSearchParams(window.location.search)) if (!minhas.has(k)) saida.set(k, v);
      const qs = saida.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );
  return [estado, gravar];
}

/** Valor que só muda depois de `ms` sem mexer (busca digitada). */
export function useComAtraso<T>(valor: T, ms = 300): T {
  const [atrasado, setAtrasado] = React.useState(valor);
  React.useEffect(() => {
    const t = window.setTimeout(() => setAtrasado(valor), ms);
    return () => window.clearTimeout(t);
  }, [valor, ms]);
  return atrasado;
}
