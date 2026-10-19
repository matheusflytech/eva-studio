"use client";

import * as React from "react";
import { BellOff, BellRing, Trash2, X } from "lucide-react";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Input, Textarea, Label, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Notice } from "@/components/ui/notice";
import { PhoneNumber } from "@/components/ui/phone-number";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ContactActivity } from "@/components/crm/contact-activity";
import { CamposDoContato } from "@/components/crm/campos-do-contato";
import { CHANNEL_LABEL, nomeDoContato, type Contact, type TagRow } from "./tipos";

/**
 * Ficha do contato em gaveta: dados que salvam ao sair do campo, etiquetas,
 * campos personalizados, anotações, opt-in, atividade (tarefas e notas) e
 * apagar.
 */
export function FichaDoContato({
  contact,
  tags,
  onClose,
  onChanged,
  onDeleted,
}: {
  contact: Contact;
  tags: TagRow[];
  onClose: () => void;
  onChanged: (c: Contact) => void;
  onDeleted: () => void;
}) {
  const [form, setForm] = React.useState({ name: contact.name, email: contact.email, phone: contact.phone, notes: contact.notes });
  const [base, setBase] = React.useState(contact);
  // Contato novo (ou salvo pelo servidor): o formulário volta ao que veio.
  if (base !== contact) {
    setBase(contact);
    setForm({ name: contact.name, email: contact.email, phone: contact.phone, notes: contact.notes });
  }
  const [saving, setSaving] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);
  const [aba, setAba] = React.useState("ficha");
  // Contador na aba: a pessoa precisa ver que há tarefa aberta sem trocar de aba.
  const [tarefasAbertas, setTarefasAbertas] = React.useState(0);

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

  async function remove() {
    if (!window.confirm(`Apagar o contato ${nomeDoContato(contact)}? Isso não pode ser desfeito.`)) return;
    setErro(null);
    const res = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(data.error ?? "Não foi possível apagar o contato.");
      return;
    }
    onDeleted();
  }

  const disponiveis = tags.filter((t) => !contact.tags.some((ct) => ct.id === t.id));
  const nome = nomeDoContato(contact);
  const subtitulo = [contact.company?.name ?? "Sem empresa", ...contact.channels.map((ch) => CHANNEL_LABEL[ch.channel] ?? ch.channel)].join(" · ");

  return (
    <Drawer open onOpenChange={(v) => !v && onClose()}>
      <DrawerContent
        title={nome}
        description={subtitulo}
        size="md"
        footer={
          <Button variant="ghost" className="mr-auto text-danger hover:text-danger" onClick={remove}>
            <Trash2 size={14} aria-hidden="true" /> Apagar contato
          </Button>
        }
      >
        <div className="mb-4 flex items-center gap-3">
          <Avatar name={nome} size="lg" />
          <div className="min-w-0 text-small text-text-secondary">
            {contact.email && <p className="truncate">{contact.email}</p>}
            {contact.phone && <PhoneNumber value={contact.phone} />}
          </div>
        </div>

        <Tabs value={aba} onValueChange={setAba}>
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="ficha">Ficha</TabsTrigger>
            <TabsTrigger value="atividade">Atividade{tarefasAbertas > 0 ? ` (${tarefasAbertas})` : ""}</TabsTrigger>
          </TabsList>

          <TabsContent value="atividade">
            <ContactActivity contactId={contact.id} onCountsChange={setTarefasAbertas} />
          </TabsContent>

          <TabsContent value="ficha" className="flex flex-col gap-5">
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

            <section>
              <Label>Etiquetas</Label>
              <div className="flex flex-wrap items-center gap-1.5">
                {contact.tags.map((t) => (
                  <span key={t.id} className="inline-flex h-6 items-center gap-1 rounded-sm bg-raised pl-2 pr-1 text-caption font-medium text-text-secondary">
                    {t.name}
                    <button
                      type="button"
                      onClick={() => patch({ removeTagId: t.id })}
                      aria-label={`Tirar a etiqueta ${t.name}`}
                      className="grid h-4 w-4 place-items-center rounded-sm text-text-tertiary hover:bg-hover hover:text-danger"
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </span>
                ))}
                {contact.tags.length === 0 && <span className="text-small text-text-tertiary">Nenhuma etiqueta.</span>}
              </div>
              {disponiveis.length > 0 && (
                <div className="mt-2">
                  <Select aria-label="Aplicar etiqueta" value="" onChange={(e) => e.target.value && patch({ addTagId: e.target.value })}>
                    <option value="">Aplicar etiqueta…</option>
                    {disponiveis.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              <p className="mt-1 text-caption text-text-tertiary">
                Aplicar uma etiqueta pode inscrever o contato numa sequência, se houver alguma com esse gatilho.
              </p>
            </section>

            <CamposDoContato contactId={contact.id} valores={contact.customFields ?? {}} aoSalvar={(c) => onChanged(c as Contact)} />

            <Field label="Anotações">
              <Textarea rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} onBlur={() => salvarSeMudou("notes")} />
            </Field>

            <section className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle px-3 py-2.5">
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
          </TabsContent>
        </Tabs>
      </DrawerContent>
    </Drawer>
  );
}
