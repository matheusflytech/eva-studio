"use client";

import * as React from "react";
import NextLink from "next/link";
import { useContrato } from "@/lib/contrato/navegacao";
import { rotaDoContrato } from "@/lib/contrato/rotas";

/**
 * O Link do Next com o contrato da URL na frente de caminhos de tela
 * (href="/deals" vira "/<contrato>/deals"). Links externos, /api,
 * /login etc. passam intactos. Ver src/lib/contrato/rotas.ts.
 */
export default function Link({ href, ...rest }: React.ComponentProps<typeof NextLink>) {
  const contrato = useContrato();
  const final =
    typeof href === "string"
      ? rotaDoContrato(contrato, href)
      : href.pathname
        ? { ...href, pathname: rotaDoContrato(contrato, href.pathname) }
        : href;
  return <NextLink href={final} {...rest} />;
}
