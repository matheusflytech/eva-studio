"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { FundoVivo } from "@/components/layout/fundo-vivo";
import { pulsar } from "@/lib/fundo/eventos";

// Mesmo palco escuro do login, sem marca nem rodapé: quem chega aqui é quem
// recebeu o e-mail de um cliente, não um usuário do app.
export function Descadastro({ token }: { token: string }) {
  const [estado, setEstado] = React.useState<"pergunta" | "enviando" | "feito" | "erro">("pergunta");
  const [mensagem, setMensagem] = React.useState("");

  async function confirmar() {
    setEstado("enviando");
    const res = await fetch(`/api/email/descadastro?t=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => null);
    const data = res ? await res.json().catch(() => ({})) : {};
    if (res?.ok) {
      setMensagem(data.email ?? "");
      setEstado("feito");
    } else {
      setMensagem(data.error ?? "Não deu para registrar agora. Tente de novo em instantes.");
      setEstado("erro");
    }
  }

  return (
    <main data-theme="dark" className="tela-de-entrada relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4">
      <FundoVivo escuro forca={1.8} className="pointer-events-none absolute inset-0 h-full w-full" />
      <span className="feixe-de-luz" aria-hidden="true" />
      <span className="feixe-de-luz feixe-fino" aria-hidden="true" />

      <div className="cartao-vidro relative z-10 w-full max-w-[400px] text-center">
        {estado === "feito" ? (
          <>
            <h1 className="text-title font-semibold tracking-tight text-text-primary">Pronto, você não vai mais receber</h1>
            <p className="mt-2 text-small text-text-secondary">
              {mensagem ? `${mensagem} saiu da lista de e-mails.` : "Seu endereço saiu da lista de e-mails."} As conversas por
              WhatsApp não mudam.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-title font-semibold tracking-tight text-text-primary">Não quer mais receber nossos e-mails?</h1>
            <p className="mt-2 text-small text-text-secondary">Confirme abaixo e seu endereço sai da lista de e-mails.</p>
            {estado === "erro" && <p className="mt-3 text-small text-danger">{mensagem}</p>}
            <Button
              type="button"
              size="lg"
              disabled={!token}
              loading={estado === "enviando"}
              onClick={(e) => {
                pulsar(e.currentTarget, 1.6);
                void confirmar();
              }}
              className="mt-6 h-11 w-full bg-inverse font-semibold text-inverse-fg hover:bg-inverse/90"
            >
              {estado === "enviando" ? "Registrando..." : "Não quero mais receber"}
            </Button>
          </>
        )}
      </div>
    </main>
  );
}
