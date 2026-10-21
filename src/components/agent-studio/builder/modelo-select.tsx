"use client";

import * as React from "react";
import { RefreshCw } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getProvider } from "@/lib/llm-providers";

interface Modelo {
  id: string;
  label: string;
}

const OUTRO = "__outro__";

async function buscarModelos(credentialId: string): Promise<{ modelos: Modelo[] | null; erro: string | null }> {
  try {
    const res = await fetch(`/api/credentials/${credentialId}/models`);
    const data = await res.json();
    if (!res.ok) return { modelos: null, erro: data.error ?? "Não deu para listar os modelos." };
    return { modelos: data.modelos?.length ? data.modelos : null, erro: data.erro ?? null };
  } catch {
    return { modelos: null, erro: "Não deu para listar os modelos." };
  }
}

// Seletor de modelo do bloco de IA. Com credencial escolhida, a lista vem da
// própria chave do cliente (o provedor diz quais modelos ela enxerga, inclusive
// os lançados depois do catálogo fixo). Sem credencial, ou se o provedor não
// responder, vale o catálogo fixo. "Outro" deixa digitar o id à mão.
export function ModeloSelect({
  provider,
  credentialId,
  value,
  onChange,
  id = "node-ai-model",
  label = "Modelo",
  trocarSeAusente = false,
}: {
  /**
   * Quando a lista da chave chega e o modelo atual não está nela, troca pelo
   * primeiro da chave. Só para escolha nova (criação de agente): em bloco já
   * salvo, trocar sozinho mudaria um fluxo publicado sem ninguém ver.
   */
  trocarSeAusente?: boolean;
  id?: string;
  label?: string;
  provider: string | undefined;
  credentialId: string | undefined;
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  const catalogo = getProvider(provider).models;
  // Resultado guardado junto com a credencial a que se refere: trocar de
  // credencial já invalida a lista antiga sem precisar limpar estado.
  const [resultado, setResultado] = React.useState<{ para: string; modelos: Modelo[] | null; erro: string | null } | null>(null);
  const [digitando, setDigitando] = React.useState(false);
  const [tentativa, setTentativa] = React.useState(0);

  React.useEffect(() => {
    if (!credentialId) return;
    let vivo = true;
    void buscarModelos(credentialId).then((r) => {
      if (vivo) setResultado({ para: credentialId, ...r });
    });
    return () => {
      vivo = false;
    };
  }, [credentialId, tentativa]);

  const valido = credentialId && resultado?.para === credentialId ? resultado : null;
  const carregando = !!credentialId && !valido;
  const daChave = valido?.modelos ?? null;
  const erro = valido?.erro ?? null;

  React.useEffect(() => {
    if (!trocarSeAusente || !daChave?.length || daChave.some((m) => m.id === value)) return;
    // Primeiro um modelo conhecido do catálogo que a chave tenha; senão o primeiro da chave.
    onChange((daChave.find((m) => catalogo.some((c) => c.id === m.id)) ?? daChave[0]).id);
  }, [trocarSeAusente, daChave, value, onChange, catalogo]);

  const opcoes = daChave ?? catalogo;
  const atual = value ?? catalogo[0]?.id ?? "";
  // Modelo gravado que não está na lista (digitado à mão ou saiu do catálogo)
  // continua aparecendo, senão o select mostraria outro e mentiria.
  const comAtual = atual && !opcoes.some((m) => m.id === atual) ? [{ id: atual, label: atual }, ...opcoes] : opcoes;

  return (
    <div>
      <div className="flex items-center justify-between">
        <Label htmlFor={id}>{label}</Label>
        {credentialId && (
          <button
            type="button"
            onClick={() => {
              setResultado(null);
              setTentativa((t) => t + 1);
            }}
            disabled={carregando}
            className="inline-flex items-center gap-1 text-[11.5px] text-accent-fg hover:underline disabled:opacity-50"
          >
            <RefreshCw className={carregando ? "size-3 animate-spin" : "size-3"} aria-hidden />
            Atualizar lista
          </button>
        )}
      </div>
      {digitando ? (
        <Input
          id={id}
          autoFocus
          placeholder="id do modelo, ex.: gpt-5.6-luna"
          defaultValue={atual}
          onBlur={(e) => {
            if (e.target.value.trim()) onChange(e.target.value.trim());
            setDigitando(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") setDigitando(false);
          }}
        />
      ) : (
        <Select
          id={id}
          value={atual}
          onChange={(e) => (e.target.value === OUTRO ? setDigitando(true) : onChange(e.target.value))}
        >
          {comAtual.map((m) => (
            <option key={m.id} value={m.id}>{m.label}</option>
          ))}
          <option value={OUTRO}>Outro modelo (digitar o id)…</option>
        </Select>
      )}
      <p className="mt-1 text-[11px] text-text-tertiary">
        {carregando
          ? "Buscando os modelos da sua chave…"
          : erro
            ? `${erro} Mostrando a lista padrão.`
            : daChave
              ? `${daChave.length} modelos disponíveis na sua chave.`
              : credentialId
                ? "Lista padrão."
                : "Escolha a credencial para ver os modelos da sua chave."}
      </p>
    </div>
  );
}
