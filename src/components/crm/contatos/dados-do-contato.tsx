"use client";

import * as React from "react";
import { BellOff, BellRing } from "lucide-react";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { CamposDoContato } from "@/components/crm/campos-do-contato";
import type { Contact } from "./tipos";

/**
 * Os dados do contato que se editam no lugar: salvam ao sair do campo
 * (sem botão Salvar), campos personalizados, anotações e opt-in. Mesmo
 * componente na ficha da lista e na aba Dados da página completa. As
 * etiquetas moram no topo da ficha (EtiquetasDoContato).
 */
export function DadosDoContato({ contact, onChanged }: { contact: Contact; onChanged: (c: Contact) => void }) {
  const [form, setForm] = React.useState({ name: contact.name, email: contact.email, phone: contact.phone, notes: contact.notes });
  const [base, setBase] = React.useState(contact);
  // Contato novo (ou salvo pelo servidor): o formulário volta ao que veio.
  if (base !== contact) {
    setBase(contact);
    setForm({ name: contact.name, email: contact.email, phone: contact.phone, notes: contact.notes });
  }
  const [saving, setSaving] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    setErro(null);
    const res = await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setErro(data.error ?? "Não foi possível salvar.");
      return;
    }
    if (data.contact) onChanged(data.contact);
  }

  // Sair do campo sem mudar nada não dispara PATCH.
  function salvarSeMudou(campo: "name" | "email" | "phone" | "notes") {
    if (form[campo] === contact[campo]) return;
    patch({ [campo]: form[campo] });
  }

  return (
    <div className="flex flex-col gap-5">
      {erro && <Notice tone="danger">{erro}</Notice>}
      <section className="flex flex-col gap-3">
        <Field label="Nome">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onBlur={() => salvarSeMudou("name")} />
        </Field>
        <Field label="E-mail">
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} onBlur={() => salvarSeMudou("email")} />
        </Field>
        <Field label="Celular">
          <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={() => salvarSeMudou("phone")} />
        </Field>
      </section>

      <CamposDoContato contactId={contact.id} valores={contact.customFields ?? {}} aoSalvar={(c) => onChanged(c as Contact)} />

      <Field label="Anotações">
        <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} onBlur={() => salvarSeMudou("notes")} />
      </Field>

      <section className="flex items-center justify-between gap-3 rounded-[14px] bg-raised px-3.5 py-2.5 ring-1 ring-border-subtle">
        <div className="flex items-center gap-2.5">
          {contact.optIn ? (
            <BellRing size={16} aria-hidden="true" className="text-text-secondary" />
          ) : (
            <BellOff size={16} aria-hidden="true" className="text-text-tertiary" />
          )}
          <div>
            <p className="text-small font-medium text-text-primary">{contact.optIn ? "Aceita receber mensagens" : "Saiu da lista"}</p>
            <p className="text-caption text-text-tertiary">
              {contact.optIn ? "Entra em disparo e sequência." : "Fica fora de todo envio em massa."}
            </p>
          </div>
        </div>
        <Button variant="secondary" size="sm" onClick={() => patch({ optIn: !contact.optIn })} disabled={saving}>
          {contact.optIn ? "Remover" : "Reativar"}
        </Button>
      </section>
    </div>
  );
}
