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
  return new Set(["v", "q", "av", "ordem", "p", "pp", "cols", "rec", ...barra.map((f) => f.param)]);
}

export interface OpcoesDoEstado {
  /** Ids de sistema aceitos em ?v= (id de visão salva sempre passa). */
  visoes?: string[];
  /**
   * Estado guardado de uma visão salva (a base da URL: com ela aberta, a URL
   * guarda só as alterações não salvas). undefined = visão de sistema.
   */
  baseDaVisao?: (id: string) => EstadoDaLista | undefined;
}

/**
 * Estado da lista guardado na URL (link compartilhável). Ler é derivado de
 * useSearchParams; gravar usa history.replaceState — e pushState quando a
 * visão muda, para o Voltar do navegador voltar para a aba anterior. O
 * roteador do Next acompanha os dois sem recarregar a página (docs do Next:
 * "linking and navigating", Native History API). Parâmetros que não são da
 * lista (ex.: ?abrir=, ?funil=) ficam como estão.
 *
 * `padrao.visao` pode mudar (visão padrão da pessoa, que chega do servidor):
 * a URL sem ?v= passa a ser lida como ela.
 */
export function useEstadoDaLista(
  barra: FiltroDaBarra[],
  padrao: PadraoDaLista,
  opcoes: OpcoesDoEstado = {}
): [EstadoDaLista, (novo: EstadoDaLista | ((e: EstadoDaLista) => EstadoDaLista)) => void] {
  const sp = useSearchParams();
  const texto = sp.toString();
  const { visoes, baseDaVisao } = opcoes;
  const estado = React.useMemo(() => {
    const q = new URLSearchParams(texto);
    const v = q.get("v")?.trim() || padrao.visao;
    return lerEstadoDaUrl(q, barra, padrao, visoes, baseDaVisao?.(v));
    // barra e visões são constantes da tela; muda a URL, a padrão ou a base.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto, padrao.visao, padrao.tamanho, baseDaVisao]);
  const atual = React.useRef(estado);
  const config = React.useRef({ padrao, baseDaVisao });
  React.useEffect(() => {
    atual.current = estado;
    config.current = { padrao, baseDaVisao };
  });

  const gravar = React.useCallback(
    (novo: EstadoDaLista | ((e: EstadoDaLista) => EstadoDaLista)) => {
      const proximo = typeof novo === "function" ? novo(atual.current) : novo;
      const trocouDeVisao = proximo.visao !== atual.current.visao;
      atual.current = proximo;
      const { padrao: p, baseDaVisao: base } = config.current;
      const minhas = chavesDoEstado(barra);
      const saida = estadoParaUrl(proximo, barra, p, base?.(proximo.visao));
      for (const [k, v] of new URLSearchParams(window.location.search)) if (!minhas.has(k)) saida.set(k, v);
      const qs = saida.toString();
      const url = `${window.location.pathname}${qs ? `?${qs}` : ""}`;
      if (trocouDeVisao) window.history.pushState(null, "", url);
      else window.history.replaceState(null, "", url);
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
