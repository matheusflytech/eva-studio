"use client";

import * as React from "react";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { ehCaminhoDeSecao, idCurto } from "@/lib/contrato/rotas";
import { buttonVariants } from "@/components/ui/button";
import { FundoVivo } from "@/components/layout/fundo-vivo";
import { MarcaEva } from "@/components/layout/marca-eva";

// /ir?para=/negocios/123 — leva para a tela no contrato padrão da pessoa
// (o último usado, se ainda tiver acesso; senão o principal). É para onde vão
// os caminhos antigos sem contrato quando não há cookie, e o pós-login.
//
// Tela de passagem: quase sempre só o palco escuro do login por um instante.
function Ir() {
  const router = useRouter();
  const { session, isLoading } = useAuth();
  const bruto = useSearchParams().get("para") ?? "";
  // Só tela do app: ?para=https://... ou //outro.site não vira redirecionamento aberto.
  const para = ehCaminhoDeSecao(bruto) && !bruto.startsWith("//") ? bruto : "/inicio";

  React.useEffect(() => {
    if (isLoading) return;
    if (!session) {
      router.replace("/login");
      return;
    }
    const contrato = session.contratoPadrao ?? session.contratoId;
    if (contrato) router.replace(`/${idCurto(contrato)}${para}`);
  }, [isLoading, session, router, para]);

  if (!isLoading && session && !session.contratoPadrao && !session.contratoId) {
    return (
      <div className="cartao-vidro relative z-10 w-full max-w-[380px] text-center">
        <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-[13px] bg-page ring-1 ring-border-default">
          <MarcaEva size={22} className="text-text-primary" />
        </span>
        <h1 className="text-title-sm font-semibold tracking-tight text-text-primary">Você ainda não participa de nenhum contrato</h1>
        <p className="mt-1 text-small text-text-secondary">Peça um convite a quem administra o contrato da sua empresa.</p>
        {session.superadmin && (
          <NextLink
            href="/admin"
            className={buttonVariants({ size: "lg", className: "mt-6 h-11 w-full bg-inverse font-semibold text-inverse-fg hover:bg-inverse/90" })}
          >
            Abrir o painel da Eva
          </NextLink>
        )}
      </div>
    );
  }
  return null;
}

export default function IrPage() {
  // useSearchParams exige Suspense: sem ele o Next recusa gerar a página. O
  // palco fica fora dele para não trocar de cor enquanto decide para onde ir.
  return (
    <div data-theme="dark" className="tela-de-entrada relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4">
      <FundoVivo escuro forca={2.4} className="pointer-events-none absolute inset-0 h-full w-full" />
      <span className="feixe-de-luz" aria-hidden="true" />
      <span className="feixe-de-luz feixe-fino" aria-hidden="true" />
      <React.Suspense fallback={null}>
        <Ir />
      </React.Suspense>
    </div>
  );
}
