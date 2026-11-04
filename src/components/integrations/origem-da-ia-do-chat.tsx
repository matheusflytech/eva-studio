"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// Integrações → IA: de quem é a chave que responde o chat da Eva neste contrato.

type Origem = "eva" | "contract";

const OPCOES: { valor: Origem; titulo: string; texto: string }[] = [
  { valor: "eva", titulo: "Chave da Eva", texto: "O chat usa a IA da plataforma. Não precisa cadastrar nada." },
  { valor: "contract", titulo: "Chave deste contrato", texto: "O chat usa a chave de IA cadastrada abaixo, e o consumo vai para a conta do contrato." },
];

export function OrigemDaIaDoChat() {
  const [origem, setOrigem] = React.useState<Origem | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    let vivo = true;
    void fetch("/api/ia/chat-source")
      .then((r) => r.json())
      .then((d) => vivo && setOrigem(d?.source === "contract" ? "contract" : "eva"))
      .catch(() => vivo && setOrigem("eva"));
    return () => {
      vivo = false;
    };
  }, []);

  async function escolher(valor: Origem) {
    const antes = origem;
    setOrigem(valor);
    setErro(null);
    const res = await fetch("/api/ia/chat-source", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source: valor }) }).catch(() => null);
    if (!res?.ok) {
      setOrigem(antes);
      setErro((await res?.json().catch(() => null))?.error ?? "Não deu para salvar. Tenta de novo.");
    }
  }

  return (
    <section aria-labelledby="ia-chat-origem" className="flex flex-col gap-2">
      <h3 id="ia-chat-origem" className="px-1 text-small font-medium text-text-secondary">
        IA do chat da Eva
      </h3>
      <div role="radiogroup" aria-labelledby="ia-chat-origem" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {OPCOES.map((o) => (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={origem === o.valor}
            disabled={origem === null}
            onClick={() => origem !== o.valor && void escolher(o.valor)}
            className={cn(
              "flex flex-col gap-1 rounded-[18px] border bg-panel px-4 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-focus disabled:opacity-60",
              origem === o.valor ? "border-accent-fg" : "border-border-subtle hover:bg-hover"
            )}
          >
            <span className="text-small font-medium text-text-primary">{o.titulo}</span>
            <span className="text-caption text-text-tertiary">{o.texto}</span>
          </button>
        ))}
      </div>
      {erro && (
        <p role="alert" className="px-1 text-caption text-danger">
          {erro}
        </p>
      )}
    </section>
  );
}
