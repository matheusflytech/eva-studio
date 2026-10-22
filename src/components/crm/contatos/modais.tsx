"use client";

import * as React from "react";
import { Input, Label, Field } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Notice } from "@/components/ui/notice";
import { Stat } from "@/components/ui/stat";
import type { TagRow } from "./tipos";

/** Cadastro manual de contato, sem esperar a pessoa escrever. */
export function NovoContato({
  agentId,
  onClose,
  onCreated,
}: {
  agentId: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [form, setForm] = React.useState({ name: "", email: "", phone: "", channel: "whatsapp_meta" });
  const [saving, setSaving] = React.useState(false);
  const [erro, setErro] = React.useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErro(null);
    // O canal só nasce com agente e telefone: o telefone é o id de envio
    // (a rota normaliza para 55 + DDD + número).
    const comCanal = !!agentId && !!form.channel && !!form.phone.trim();
    const res = await fetch(`/api/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        email: form.email,
        phone: form.phone,
        ...(comCanal ? { agentId, channel: form.channel, externalId: form.phone } : {}),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setErro((await res.json().catch(() => ({}))).error ?? "Não foi possível criar o contato.");
      return;
    }
    onCreated();
  }

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent
        title="Criar contato"
        description="Cadastro manual, sem precisar esperar a pessoa escrever."
        footer={
          <>
            <Button variant="secondary" onClick={onClose}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={save} loading={saving}>
              Criar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {erro && <Notice tone="danger">{erro}</Notice>}
          <Field label="Nome">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="E-mail">
              <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </Field>
            <Field label="Celular">
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+55 11 99999-9999" />
            </Field>
          </div>
          {/* Só canais em que o telefone identifica a pessoa: no Instagram e
              no site o id externo não é telefone. */}
          <Field label="Canal" hint="O telefone vira o identificador de envio nesse canal. Sem ele o contato existe, mas não recebe disparo.">
            <Select value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              <option value="whatsapp_meta">WhatsApp (oficial)</option>
              <option value="whatsapp_qr">WhatsApp (QR)</option>
              <option value="">Nenhum</option>
            </Select>
          </Field>
        </div>
      </ModalContent>
    </Modal>
  );
}

/** Importação de contatos por CSV (POST /api/contacts/import). */
export function ImportarContatos({
  agentId,
  tags,
  onClose,
  onDone,
}: {
  agentId: string | null;
  tags: TagRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [csv, setCsv] = React.useState("");
  const [channel, setChannel] = React.useState("whatsapp_meta");
  const [tagId, setTagId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null);

  async function run() {
    setBusy(true);
    const res = await fetch(`/api/contacts/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Sem agentId a rota não cria o canal: o contato entraria sem como
      // receber disparo.
      body: JSON.stringify({
        csv,
        tagId: tagId || undefined,
        ...(agentId && channel ? { agentId, channel } : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    setResult(res.ok ? data : { created: 0, updated: 0, skipped: 0, errors: [data.error ?? "Falhou."] });
  }

  const linhas = csv ? csv.split("\n").filter((l) => l.trim()).length - 1 : 0;

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent
        title="Importar contatos"
        description="CSV com cabeçalho (vírgula ou ponto e vírgula). Nome, e-mail e telefone são reconhecidos sozinhos; coluna com o nome de um campo do contato é validada; o resto vira campo livre."
        footer={
          result ? (
            <Button variant="primary" onClick={onDone}>
              Pronto
            </Button>
          ) : (
            <>
              <Button variant="secondary" onClick={onClose}>
                Cancelar
              </Button>
              <Button variant="primary" onClick={run} disabled={!csv} loading={busy}>
                Importar
              </Button>
            </>
          )
        }
      >
        {result ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3 rounded-lg border border-border-subtle p-3">
              <Stat label="Criados" value={result.created} />
              <Stat label="Atualizados" value={result.updated} />
              <Stat label="Ignorados" value={result.skipped} />
            </div>
            {result.errors.length > 0 && (
              <Notice tone="warning">
                <ul className="flex flex-col gap-1">
                  {result.errors.map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </Notice>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="csv-contatos">Arquivo</Label>
              <input
                id="csv-contatos"
                type="file"
                accept=".csv,text/csv"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f) setCsv(await f.text());
                }}
                className="block w-full text-small text-text-secondary file:mr-3 file:h-8 file:rounded-md file:border file:border-border-default file:bg-panel file:px-3 file:text-small file:text-text-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Canal">
                <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
                  <option value="whatsapp_meta">WhatsApp (oficial)</option>
                  <option value="whatsapp_qr">WhatsApp (QR)</option>
                  <option value="telegram">Telegram</option>
                </Select>
              </Field>
              <Field label="Etiquetar como">
                <Select value={tagId} onChange={(e) => setTagId(e.target.value)}>
                  <option value="">Nenhuma</option>
                  {tags.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {csv && <p className="text-caption text-text-tertiary">{linhas} linha(s) prontas para importar.</p>}
          </div>
        )}
      </ModalContent>
    </Modal>
  );
}
