"use client";

import * as React from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { FundoVivo } from "@/components/layout/fundo-vivo";

// Mesmo palco do descadastro. Definir a senha aqui é o que aceita o convite:
// a senha antiga da conta (que pode não ser de quem recebeu o e-mail) deixa de valer.
export function AceitarConvite({ token }: { token: string }) {
  const [senha, setSenha] = React.useState("");
  const [estado, setEstado] = React.useState<"form" | "enviando" | "feito">("form");
  const [erro, setErro] = React.useState("");

  async function aceitar(e: React.FormEvent) {
    e.preventDefault();
    setEstado("enviando");
    setErro("");
    const res = await fetch("/api/convites/aceitar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ t: token, senha }),
    }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) return setEstado("feito");
    setErro(data.error ?? "Não deu para aceitar agora. Tente de novo em instantes.");
    setEstado("form");
  }

  return (
    <main data-theme="dark" className="tela-de-entrada relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4">
      <FundoVivo escuro forca={1.8} className="pointer-events-none absolute inset-0 h-full w-full" />
      <span className="feixe-de-luz" aria-hidden="true" />
      <span className="feixe-de-luz feixe-fino" aria-hidden="true" />

      <div className="cartao-vidro relative z-10 w-full max-w-[400px]">
        {estado === "feito" ? (
          <div className="text-center">
            <h1 className="text-title font-semibold tracking-tight text-text-primary">Convite aceito</h1>
            <p className="mt-2 text-small text-text-secondary">Entre com seu e-mail e a senha nova.</p>
            <Link href="/login" className="mt-6 inline-block font-medium text-text-primary hover:underline">
              Entrar
            </Link>
          </div>
        ) : (
          <form onSubmit={aceitar}>
            <h1 className="text-title font-semibold tracking-tight text-text-primary">Aceitar convite</h1>
            <p className="mt-2 text-small text-text-secondary">
              Defina uma senha nova para a sua conta. As sessões abertas em outros aparelhos serão encerradas.
            </p>
            <Field label="Senha nova" error={erro || undefined} className="mt-5">
              <Input
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Pelo menos 8 caracteres"
              />
            </Field>
            <Button
              type="submit"
              size="lg"
              disabled={!token}
              loading={estado === "enviando"}
              className="mt-6 h-11 w-full bg-inverse font-semibold text-inverse-fg hover:bg-inverse/90"
            >
              {estado === "enviando" ? "Salvando..." : "Aceitar e salvar senha"}
            </Button>
            {!token && <p className="mt-3 text-small text-danger">Link incompleto. Abra de novo o link do e-mail.</p>}
          </form>
        )}
      </div>
    </main>
  );
}
