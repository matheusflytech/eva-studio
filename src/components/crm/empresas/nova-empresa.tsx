"use client";

import * as React from "react";
import { Input, Textarea, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Modal, ModalContent } from "@/components/ui/modal";

/** Criar empresa: poucos campos, o resto se completa na página da empresa. */
export function NovaEmpresa({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = React.useState({
    name: "", cnpj: "", sector: "", website: "", phone: "", city: "", uf: "", description: "",
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json()).error ?? "Não foi possível cadastrar.");
      return;
    }
    onCreated();
  }

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent
        title="Nova empresa"
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_180px]">
            <Field label="Nome">
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
            </Field>
            <Field label="CNPJ">
              <Input
                value={form.cnpj}
                inputMode="numeric"
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                placeholder="só números"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Setor">
              <Input value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
            </Field>
            <Field label="Site">
              <Input value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </Field>
            <Field label="Telefone">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </Field>
            <div className="grid grid-cols-[1fr_72px] gap-2">
              <Field label="Cidade">
                <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </Field>
              <Field label="UF">
                <Input maxLength={2} value={form.uf} onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })} />
              </Field>
            </div>
          </div>
          <Field label="Observações">
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
      </ModalContent>
    </Modal>
  );
}
