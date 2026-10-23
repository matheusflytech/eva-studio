"use client";

import * as React from "react";
import { Field, Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { CREDENTIAL_TYPES, LLM_PROVIDERS } from "@/lib/llm-providers";
import { useSearchParams } from "@/lib/contrato/navegacao";

// Resultado da volta do "Entrar com OpenRouter" (?openrouter= na URL).
const RESULTADO_OPENROUTER: Record<string, { tom: "info" | "danger"; texto: string }> = {
  ok: { tom: "info", texto: "Conta do OpenRouter conectada. A chave já aparece aqui e pode entrar na fila de resposta." },
  cancelado: { tom: "danger", texto: "A conexão com o OpenRouter foi cancelada." },
};

export interface CredentialRow {
  id: string;
  name: string;
  type: string;
  createdAt: string;
}

export const TYPE_LABEL: Record<string, string> = Object.fromEntries(CREDENTIAL_TYPES.map((t) => [t.value, t.label]));
const KEY_URL: Record<string, string> = { ...Object.fromEntries(LLM_PROVIDERS.map((p) => [p.credentialType, p.keyUrl])), resend: "https://resend.com/api-keys" };

export function formatAge(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "há 1 dia";
  return `há ${days} dias`;
}

// Credenciais reutilizáveis (todos os provedores de IA do catálogo e o Resend)
// usadas pela Central de IA, pelos blocos de IA e pelo "Enviar e-mail" do
// Builder — igual o jeito que o n8n deixa cadastrar uma credencial uma vez e
// reaproveitar em vários workflows. v5: a lista mora em Integrações → IA
// (central-de-ia.tsx); aqui ficam a leitura, o apagar e o "Nova credencial".

/** Lista de credenciais do contrato, com apagar otimista. */
export function useCredenciais() {
  const [credentials, setCredentials] = React.useState<CredentialRow[] | null>(null);

  const load = React.useCallback(() => {
    fetch("/api/credentials")
      .then((res) => res.json())
      .then((data) => setCredentials(data.credentials ?? []))
      .catch(() => setCredentials([]));
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const adicionar = React.useCallback((c: CredentialRow) => setCredentials((prev) => [c, ...(prev ?? [])]), []);

  const apagar = React.useCallback(
    async (id: string) => {
      setCredentials((prev) => (prev ?? []).filter((c) => c.id !== id));
      await fetch(`/api/credentials/${id}`, { method: "DELETE" }).catch(() => load());
    },
    [load]
  );

  return { credentials, adicionar, apagar };
}

/** Aviso da volta do "Entrar com OpenRouter". */
export function AvisoDoOpenRouter() {
  const volta = useSearchParams().get("openrouter");
  const resultado = volta ? RESULTADO_OPENROUTER[volta] ?? { tom: "danger" as const, texto: "Não deu para conectar o OpenRouter agora. Tente de novo." } : null;
  if (!resultado) return null;
  return <Notice tone={resultado.tom}>{resultado.texto}</Notice>;
}

/** Janela "Nova credencial": nome, tipo e a chave. */
export function NovaCredencial({
  aberta,
  aoFechar,
  aoCriar,
}: {
  aberta: boolean;
  aoFechar: () => void;
  aoCriar: (c: CredentialRow) => void;
}) {
  const [newName, setNewName] = React.useState("");
  const [newType, setNewType] = React.useState<string>("openai");
  const [newSecret, setNewSecret] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function fechar() {
    setError(null);
    aoFechar();
  }

  async function handleCreate(e?: React.FormEvent) {
    e?.preventDefault();
    if (!newName.trim() || !newSecret.trim()) {
      setError("Preencha nome e chave.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim(), type: newType, secret: newSecret.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar credencial.");
      aoCriar(data.credential);
      setNewName("");
      setNewSecret("");
      aoFechar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro inesperado.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={aberta} onOpenChange={(v) => !v && fechar()}>
      <ModalContent
        title="Nova credencial"
        description="Cadastre uma vez e use nos agentes, nos blocos de IA e no “Enviar e-mail” do Builder."
        footer={
          <>
            <Button variant="ghost" onClick={fechar}>
              Cancelar
            </Button>
            <Button type="submit" form="form-nova-credencial" disabled={saving}>
              {saving ? "Salvando..." : "Salvar credencial"}
            </Button>
          </>
        }
      >
        <form id="form-nova-credencial" onSubmit={handleCreate} className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Nome">
              <Input placeholder="Ex: Groq principal" value={newName} onChange={(e) => setNewName(e.target.value)} />
            </Field>
            <Field label="Tipo">
              <Select value={newType} onChange={(e) => setNewType(e.target.value)}>
                {CREDENTIAL_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Chave de API">
            <Input type="password" placeholder="Cole a chave de API aqui" value={newSecret} onChange={(e) => setNewSecret(e.target.value)} className="font-mono" />
          </Field>
          {KEY_URL[newType] && (
            <a href={KEY_URL[newType]} target="_blank" rel="noreferrer" className="-mt-1 self-start text-caption text-accent-fg hover:underline">
              Onde pegar a chave do {TYPE_LABEL[newType]}
            </a>
          )}
          {error && <Notice tone="danger">{error}</Notice>}
        </form>
      </ModalContent>
    </Modal>
  );
}
