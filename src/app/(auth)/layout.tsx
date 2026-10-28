"use client";

import * as React from "react";
import { MarcaEva } from "@/components/layout/marca-eva";
import { FundoGelo } from "@/components/entrada/fundo-gelo";
import { BustoConstelacao } from "@/components/entrada/busto-constelacao";

// ---------------------------------------------------------------------------
// Entrar (v6; conta nova só por convite): o cartão escuro flutua sobre o fundo "gelo"
// (cordilheira em linhas finas). À esquerda o formulário; à direita Júlio
// César em nuvem de pontos, que gira devagar seguindo o mouse e acende perto
// da mão (proposta 2, "Constelação"). O cartão sobe do desfoque ao abrir.
// ---------------------------------------------------------------------------

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#eef2f6] px-6 py-16">
      <FundoGelo className="pointer-events-none absolute inset-0 h-full w-full" />

      <span className="absolute left-8 top-7 z-10 text-small font-semibold text-[#121214]">Eva Holding</span>

      <div data-theme="dark" className="cartao-de-entrada relative z-10 grid w-full max-w-[1040px] lg:min-h-[min(600px,calc(100vh-160px))] lg:grid-cols-[420px_1fr]">
        <div className="relative z-10 flex flex-col justify-center px-8 py-10 sm:px-14">
          <span className="mb-7 grid h-12 w-12 place-items-center rounded-[14px] bg-[#f2f2f4]">
            <MarcaEva size={26} title="Eva" className="text-[#0c0c0e]" />
          </span>
          {children}
        </div>
        <div className="palco-do-busto relative hidden lg:block">
          <BustoConstelacao className="absolute inset-0" />
          <p className="pointer-events-none absolute bottom-7 left-8 font-mono text-[11px] leading-[1.7] tracking-[0.2em] text-[#4c4c54]">
            GAIVS · IVLIVS · CAESAR
            <br />
            EVA HOLDING · MMXXVI
          </p>
        </div>
      </div>

      <span className="absolute bottom-6 z-10 font-mono text-caption text-[#8a93a3]">evapp.vercel.app</span>
    </div>
  );
}
