"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { CamposDoFormulario, rascunhoInicial, rascunhoParaEnvio, type Rascunho } from "@/components/crm/campos-personalizados";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";

// Campos do contato, no painel lateral: os que o cliente definiu (editáveis,
// com tipo) e, abaixo, o que o fluxo capturou sem ter um campo definido.

export function CamposDoContato({
  contactId,
  valores,
  aoSalvar,
}: {
  contactId: string;
  valores: Record<string, unknown>;
  aoSalvar: (contato: unknown) => void;
}) {
  const [defs, setDefs] = React.useState<DefinicaoDeCampo[] | null>(null);
  const [rascunho, setRascunho] = React.useState<Rascunho>({});
  const [sujo, setSujo] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  React.useEffect(() => {
    fetch("/api/custom-fields?entity=contact")
      .then((r) => r.json())
      .then((d) => setDefs(d.fields ?? []))
      .catch(() => setDefs([]));
  }, []);

  const chaveDosValores = JSON.stringify(valores ?? {});

  React.useEffect(() => {
    if (!defs) return;
    setRascunho(rascunhoInicial(defs, valores));
    setSujo(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defs, chaveDosValores]);

  async function salvar() {
    if (!defs) return;
    setBusy(true);
    setErro(null);
    const res = await fetch(`/api/contacts/${contactId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ customFields: rascunhoParaEnvio(defs, rascunho) }),
    });
    setBusy(false);
    const dados = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(dados.error ?? "Não foi possível salvar.");
      return;
    }
    setSujo(false);
    if (dados.contact) aoSalvar(dados.contact);
  }

  if (defs === null) return null;

  const chavesDefinidas = new Set(defs.map((d) => d.key));
  const livres = Object.entries(valores ?? {}).filter(([k, v]) => !chavesDefinidas.has(k) && v !== null && v !== "");

  return (
    <>
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <Label className="mb-0">Dados do contato</Label>
          <Link href="/negocios/configurar" className="inline-flex items-center gap-1 text-[12px] text-text-tertiary hover:text-text-primary">
            <SlidersHorizontal size={12} /> Personalizar
          </Link>
        </div>
        {defs.length === 0 ? (
          <p className="text-[12.5px] text-text-tertiary">
            Nenhum campo extra criado. Em Personalizar você cria os campos que fazem sentido para o seu negócio.
          </p>
        ) : (
          <CamposDoFormulario
            defs={defs}
            rascunho={rascunho}
            prefixo="ct"
            onChange={(k, v) => { setRascunho((r) => ({ ...r, [k]: v })); setSujo(true); }}
          />
        )}
        {erro && <p className="text-[12.5px] text-danger">{erro}</p>}
        {sujo && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setRascunho(rascunhoInicial(defs, valores)); setSujo(false); setErro(null); }}>
              Descartar
            </Button>
            <Button onClick={salvar} disabled={busy}>
              {busy && <Loader2 size={15} className="animate-spin" />} Salvar dados
            </Button>
          </div>
        )}
      </section>

      {livres.length > 0 && (
        <section>
          <Label>Capturado no fluxo</Label>
          <dl className="mt-1.5 flex flex-col gap-1.5 rounded-2xl bg-surface-2 px-4 py-3">
            {livres.map(([key, value]) => (
              <div key={key} className="flex items-start justify-between gap-4 text-[13px]">
                <dt className="text-text-tertiary">{key}</dt>
                <dd className="max-w-[60%] break-words text-right text-text-primary">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
    </>
  );
}
