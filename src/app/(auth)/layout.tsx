"use client";

import * as React from "react";
import { FundoVivo } from "@/components/layout/fundo-vivo";
import { MarcaEva } from "@/components/layout/marca-eva";

// ---------------------------------------------------------------------------
// Entrar e criar conta: sempre no escuro. Preto quase puro, um feixe de luz
// diagonal, as curvas do fundo vivo bem de leve e o formulário num cartão de
// vidro fosco que sobe do desfoque ao abrir.
// ---------------------------------------------------------------------------

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-theme="dark" className="tela-de-entrada relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4">
      <FundoVivo escuro forca={2.4} className="pointer-events-none absolute inset-0 h-full w-full" />
      <span className="feixe-de-luz" aria-hidden="true" />
      <span className="feixe-de-luz feixe-fino" aria-hidden="true" />

      <span className="absolute left-8 top-7 z-10 text-small font-semibold text-text-secondary">Eva Holding</span>

      <div className="cartao-vidro relative z-10 w-full max-w-[380px]">
        <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-[13px] bg-page ring-1 ring-white/10">
          <MarcaEva size={22} className="text-[#f2f2f4]" />
        </span>
        {children}
      </div>

      <span className="absolute bottom-6 z-10 font-mono text-caption text-text-disabled">evapp.vercel.app</span>
    </div>
  );
}
