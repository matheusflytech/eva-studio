"use client";

import * as React from "react";
import NextLink from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/auth-context";
import { ehCaminhoDeSecao } from "@/lib/contrato/rotas";
import { buttonVariants } from "@/components/ui/button";

// /ir?para=/negocios/123 — leva para a tela no contrato padrão da pessoa
// (o último usado, se ainda tiver acesso; senão o principal). É para onde vão
// os caminhos antigos sem contrato quando não há cookie, e o pós-login.
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
    if (contrato) router.replace(`/${contrato}${para}`);
  }, [isLoading, session, router, para]);

  if (!isLoading && session && !session.contratoPadrao && !session.contratoId) {
    return (
      <div className="app-backdrop flex min-h-[100dvh] items-center justify-center p-6">
        <div className="glass-card max-w-md rounded-3xl p-8 text-center">
          <h1 className="font-display text-lg font-semibold text-text-primary">Você ainda não participa de nenhum contrato</h1>
          <p className="mt-2 text-[13px] text-text-secondary">Peça um convite a quem administra o contrato da sua empresa.</p>
          {session.superadmin && (
            <NextLink href="/admin" className={buttonVariants({ size: "md", className: "mt-5" })}>
              Abrir o painel da Eva
            </NextLink>
          )}
        </div>
      </div>
    );
  }
  return <div className="min-h-screen bg-bg-base" />;
}

export default function IrPage() {
  // useSearchParams exige Suspense: sem ele o Next recusa gerar a página.
  return (
    <React.Suspense fallback={<div className="min-h-screen bg-bg-base" />}>
      <Ir />
    </React.Suspense>
  );
}
