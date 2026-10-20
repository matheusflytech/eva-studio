"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { CamposDoFormulario, rascunhoParaEnvio, type Rascunho } from "@/components/crm/campos-personalizados";
import type { DefinicaoDeCampo } from "@/lib/custom-fields";
import { reaisDigitados } from "@/lib/dinheiro";

export interface FunilDaTela {
  id: string;
  name: string;
  stages: { id: string; name: string; type: string }[];
}

/** Criar negócio: nome, valor, etapa, contato, campos do funil e observações. */
export function NovoNegocio({
  pipelines,
  pipelineId,
  etapaInicial,
  onClose,
  onCreated,
}: {
  pipelines: FunilDaTela[];
  pipelineId: string;
  /** Vazio = primeira etapa; o "+" da coluna já manda a etapa dela. */
  etapaInicial: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = React.useState({ name: "", amount: "", stageId: etapaInicial, description: "" });
  const [contactQuery, setContactQuery] = React.useState("");
  const [contacts, setContacts] = React.useState<{ id: string; name: string; email: string }[]>([]);
  const [contactId, setContactId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [campos, setCampos] = React.useState<DefinicaoDeCampo[]>([]);
  const [rascunho, setRascunho] = React.useState<Rascunho>({});

  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];

  React.useEffect(() => {
    if (!pipeline?.id) return;
    fetch(`/api/custom-fields?entity=deal&pipelineId=${pipeline.id}`)
      .then((r) => r.json())
      .then((d) => setCampos(d.fields ?? []))
      .catch(() => setCampos([]));
  }, [pipeline?.id]);

  // Busca de contato com atraso; com menos de 2 letras a lista fica vazia.
  const buscaValida = contactQuery.trim().length >= 2;
  React.useEffect(() => {
    if (!buscaValida) return;
    const timer = setTimeout(() => {
      fetch(`/api/contacts?q=${encodeURIComponent(contactQuery)}&pageSize=25`)
        .then((r) => r.json())
        .then((d) => setContacts(d.contacts ?? []))
        .catch(() => setContacts([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [contactQuery, buscaValida]);

  async function save() {
    const amount = reaisDigitados(form.amount);
    if (amount === null) {
      setError("Valor inválido (máximo R$ 21 milhões).");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/deals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        pipelineId: pipeline?.id,
        stageId: form.stageId || undefined,
        amount,
        description: form.description,
        contactId: contactId || undefined,
        customFields: rascunhoParaEnvio(campos, rascunho),
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Não foi possível criar o negócio.");
      return;
    }
    onCreated();
  }

  const sugestoes = buscaValida && !contactId ? contacts : [];

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent
        title="Criar negócio"
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={save} loading={busy} disabled={!form.name.trim()}>
              Criar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {error && <Notice tone="danger">{error}</Notice>}
          <Field label="Nome" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Implantação para Acme" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Valor">
              <Input value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="1500,00" inputMode="decimal" />
            </Field>
            <Field label="Etapa">
              <Select value={form.stageId} onChange={(e) => setForm({ ...form, stageId: e.target.value })}>
                <option value="">Primeira etapa</option>
                {(pipeline?.stages ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div>
            <Field label="Contato">
              <Input
                value={contactQuery}
                onChange={(e) => {
                  setContactQuery(e.target.value);
                  setContactId("");
                }}
                placeholder="Buscar por nome, e-mail ou telefone"
              />
            </Field>
            {sugestoes.length > 0 && (
              <ul className="mt-1 flex max-h-36 flex-col overflow-y-auto rounded-md border border-border-default bg-overlay p-1">
                {sugestoes.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setContactId(c.id);
                        setContactQuery(c.name || c.email);
                      }}
                      className="w-full rounded-sm px-2 py-1.5 text-left text-small text-text-primary hover:bg-hover"
                    >
                      {c.name || "Sem nome"} <span className="text-text-tertiary">{c.email}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {contactId && (
              <p className="mt-1 inline-flex items-center gap-1.5 text-caption text-success">
                Contato vinculado
                <button
                  type="button"
                  aria-label="Desvincular contato"
                  className="text-text-tertiary hover:text-text-primary"
                  onClick={() => {
                    setContactId("");
                    setContactQuery("");
                  }}
                >
                  <X size={12} aria-hidden="true" />
                </button>
              </p>
            )}
          </div>

          <CamposDoFormulario defs={campos} rascunho={rascunho} prefixo="novo" colunas={2} onChange={(k, v) => setRascunho((r) => ({ ...r, [k]: v }))} />

          <Field label="Observações">
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
      </ModalContent>
    </Modal>
  );
}
