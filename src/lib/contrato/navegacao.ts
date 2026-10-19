"use client";

import * as React from "react";
import {
  useParams,
  usePathname as usePathnameDoNext,
  useRouter as useRouterDoNext,
} from "next/navigation";
import { contratoDoCaminho, ehIdDeContrato, rotaDoContrato, tirarContrato } from "./rotas";

// ---------------------------------------------------------------------------
// Navegação dentro do contrato. As telas importam useRouter/usePathname daqui
// (e Link de "@/components/contrato/link") em vez de "next/navigation": assim
// router.push("/negocios/1") vai para "/<contrato>/negocios/1" sem cada tela
// precisar saber do contrato, e usePathname() devolve o caminho sem ele (o
// menu compara "/negocios" como sempre comparou).
// ---------------------------------------------------------------------------

export { useParams, useSearchParams } from "next/navigation";

/** Contrato da URL atual (null fora de contrato, ex.: /admin). */
export function useContrato(): string | null {
  const params = useParams<{ contrato?: string }>();
  const pathname = usePathnameDoNext();
  const doParam = params?.contrato;
  return ehIdDeContrato(doParam) ? doParam : contratoDoCaminho(pathname);
}

/** Monta caminho de tela no contrato atual: rota("/negocios/1"). */
export function useRota(): (caminho: string) => string {
  const contrato = useContrato();
  return React.useCallback((caminho: string) => rotaDoContrato(contrato, caminho), [contrato]);
}

/** usePathname sem o contrato: "/<id>/negocios/1" → "/negocios/1". */
export function usePathname(): string {
  return tirarContrato(usePathnameDoNext() ?? "/");
}

type RouterDoNext = ReturnType<typeof useRouterDoNext>;

/** useRouter que põe o contrato na frente de caminhos de tela. */
export function useRouter(): RouterDoNext {
  const router = useRouterDoNext();
  const contrato = useContrato();
  return React.useMemo<RouterDoNext>(
    () => ({
      ...router,
      push: (href, opts) => router.push(rotaDoContrato(contrato, href), opts),
      replace: (href, opts) => router.replace(rotaDoContrato(contrato, href), opts),
      prefetch: (href, opts) => router.prefetch(rotaDoContrato(contrato, href), opts),
    }),
    [router, contrato]
  );
}
