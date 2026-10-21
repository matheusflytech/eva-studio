"use client";

import * as React from "react";

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
    <main className="flex min-h-screen items-center justify-center bg-bg-base px-4">
      <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-panel p-6 text-center">
        {estado === "feito" ? (
          <>
            <h1 className="font-display text-lg font-semibold text-text-primary">Pronto, você não vai mais receber</h1>
            <p className="mt-2 text-[13.5px] text-text-secondary">
              {mensagem ? `${mensagem} saiu da lista de e-mails.` : "Seu endereço saiu da lista de e-mails."} As conversas por
              WhatsApp não mudam.
            </p>
          </>
        ) : (
          <>
            <h1 className="font-display text-lg font-semibold text-text-primary">Não quer mais receber nossos e-mails?</h1>
            <p className="mt-2 text-[13.5px] text-text-secondary">Confirme abaixo e seu endereço sai da lista de e-mails.</p>
            {estado === "erro" && <p className="mt-3 text-[13px] text-danger">{mensagem}</p>}
            <button
              type="button"
              disabled={!token || estado === "enviando"}
              onClick={() => void confirmar()}
              className="mt-5 inline-flex h-9 items-center rounded-md bg-accent-solid px-4 text-body font-medium text-text-on-accent hover:bg-accent-solid-hover disabled:opacity-60"
            >
              {estado === "enviando" ? "Registrando..." : "Não quero mais receber"}
            </button>
          </>
        )}
      </div>
    </main>
  );
}
