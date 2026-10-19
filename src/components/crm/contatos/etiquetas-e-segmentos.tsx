"use client";

import * as React from "react";
import { Filter, Plus, Tag as TagIcon, Trash2, X } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalContent } from "@/components/ui/modal";
import { OP_LABEL, OPS_WITHOUT_VALUE, RULE_FIELDS, type SegmentRow, type SegmentRule, type TagRow } from "./tipos";

// Abas Etiquetas e Segmentos da tela de Contatos.

export function TagsTab({
  tags, onChanged, onError,
}: { tags: TagRow[]; onChanged: () => void; onError: (e: string | null) => void }) {
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function create() {
    if (!name.trim()) return;
    setBusy(true);
    onError(null);
    const res = await fetch(`/api/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim() }),
    });
    setBusy(false);
    if (!res.ok) {
      onError((await res.json()).error ?? "Não foi possível criar a etiqueta.");
      return;
    }
    setName("");
    onChanged();
  }

  async function remove(tag: TagRow) {
    const aviso = tag.contactCount > 0 ? ` Ela sai de ${tag.contactCount} contato(s).` : "";
    if (!window.confirm(`Apagar a etiqueta "${tag.name}"?${aviso}`)) return;
    onError(null);
    const res = await fetch(`/api/tags/${tag.id}`, { method: "DELETE" });
    if (!res.ok) {
      onError((await res.json().catch(() => ({}))).error ?? "Não foi possível apagar a etiqueta.");
      return;
    }
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Nova etiqueta</CardTitle>
          <CardDescription>
            Etiqueta é o jeito mais simples de segmentar, e é o gatilho mais usado para entrar numa sequência.
          </CardDescription>
        </CardHeader>
        <div className="flex gap-2">
          <Input
            placeholder="Ex: pediu orçamento"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && create()}
          />
          <Button onClick={create} disabled={busy || !name.trim()}>
            <Plus size={14} aria-hidden="true" /> Criar
          </Button>
        </div>
      </Card>

      {tags.length === 0 ? (
        <EmptyState
          icon={<TagIcon size={18} />}
          title="Nenhuma etiqueta ainda"
          description="Crie a primeira acima. Elas aparecem na ficha de cada contato e nos filtros."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tags.map((t) => (
            <Card key={t.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium text-text-primary">{t.name}</div>
                <div className="text-caption text-text-tertiary">
                  {t.contactCount} contato{t.contactCount === 1 ? "" : "s"}
                </div>
              </div>
              <button
                onClick={() => remove(t)}
                className="shrink-0 rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-danger-subtle hover:text-danger"
                aria-label={`Apagar etiqueta ${t.name}`}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba Segmentos
// ---------------------------------------------------------------------------

export function SegmentsTab({
  segments, tags, onChanged, onError,
}: {
  segments: SegmentRow[];
  tags: TagRow[];
  onChanged: () => void;
  onError: (e: string | null) => void;
}) {
  const [editing, setEditing] = React.useState<SegmentRow | "new" | null>(null);

  async function remove(segment: SegmentRow) {
    if (!window.confirm(`Apagar o segmento "${segment.name}"?`)) return;
    onError(null);
    const res = await fetch(`/api/segments/${segment.id}`, { method: "DELETE" });
    if (!res.ok) {
      onError((await res.json().catch(() => ({}))).error ?? "Não foi possível apagar o segmento.");
      return;
    }
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="max-w-xl text-body text-text-secondary">
          Segmento é um público salvo: em vez de colar uma lista de números, você descreve quem deve receber e o
          número de pessoas se atualiza sozinho.
        </p>
        <Button onClick={() => setEditing("new")}>
          <Plus size={14} aria-hidden="true" /> Novo segmento
        </Button>
      </div>

      {segments.length === 0 ? (
        <EmptyState
          icon={<Filter size={18} />}
          title="Nenhum segmento ainda"
          description="Ex: quem tem a etiqueta “pediu orçamento” e não respondeu nos últimos 7 dias."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {segments.map((s) => (
            <Card key={s.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-text-primary">{s.name}</div>
                  <div className="text-caption text-text-tertiary">
                    {s.contactCount} contato{s.contactCount === 1 ? "" : "s"} agora ·{" "}
                    {s.match === "any" ? "qualquer regra" : "todas as regras"}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" onClick={() => setEditing(s)}>Editar</Button>
                  <button
                    onClick={() => remove(s)}
                    className="rounded-md p-1.5 text-text-tertiary transition-colors hover:bg-danger-subtle hover:text-danger"
                    aria-label={`Apagar segmento ${s.name}`}
                  >
                    <Trash2 size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <ul className="flex flex-col gap-1 text-caption text-text-secondary">
                {s.rules.slice(0, 3).map((r, i) => (
                  <li key={i} className="truncate">
                    {describeRule(r, tags)}
                  </li>
                ))}
                {s.rules.length > 3 && <li className="text-text-tertiary">+{s.rules.length - 3} regra(s)</li>}
                {s.rules.length === 0 && <li className="text-text-tertiary">Sem regra: pega todo mundo.</li>}
              </ul>
            </Card>
          ))}
        </div>
      )}

      {editing && (
        <SegmentEditor
          segment={editing === "new" ? null : editing}
          tags={tags}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onChanged(); }}
          onError={onError}
        />
      )}
    </div>
  );
}

function describeRule(rule: SegmentRule, tags: TagRow[]): string {
  const fieldKey = rule.field.startsWith("custom:") ? "custom" : rule.field;
  const fieldLabel =
    fieldKey === "custom"
      ? `Campo “${rule.field.slice(7)}”`
      : RULE_FIELDS.find((f) => f.value === fieldKey)?.label ?? rule.field;
  const op = OP_LABEL[rule.op] ?? rule.op;
  if (OPS_WITHOUT_VALUE.has(rule.op)) return `${fieldLabel} ${op}`;
  const value = rule.field === "tag" ? tags.find((t) => t.id === rule.value)?.name ?? "?" : rule.value ?? "";
  return `${fieldLabel} ${op} ${value}`;
}

function SegmentEditor({
  segment, tags, onClose, onSaved, onError,
}: {
  segment: SegmentRow | null;
  tags: TagRow[];
  onClose: () => void;
  onSaved: () => void;
  onError: (e: string | null) => void;
}) {
  const [name, setName] = React.useState(segment?.name ?? "");
  const [match, setMatch] = React.useState(segment?.match ?? "all");
  const [rules, setRules] = React.useState<SegmentRule[]>(segment?.rules ?? []);
  const [saving, setSaving] = React.useState(false);

  function updateRule(index: number, patch: Partial<SegmentRule>) {
    setRules(rules.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }

  async function save() {
    if (!name.trim()) return;
    setSaving(true);
    onError(null);
    const url = segment
      ? `/api/segments/${segment.id}`
      : `/api/segments`;
    const res = await fetch(url, {
      method: segment ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), match, rules }),
    });
    setSaving(false);
    if (!res.ok) {
      onError((await res.json()).error ?? "Não foi possível salvar o segmento.");
      return;
    }
    onSaved();
  }

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent
        className="max-w-2xl"
        title={segment ? "Editar segmento" : "Novo segmento"}
        description="Descreva quem entra. O número de pessoas é recalculado toda vez que o segmento é usado."
      >
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_180px] gap-4">
            <div>
              <Label htmlFor="s-nome">Nome</Label>
              <Input id="s-nome" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: orçamento sem resposta" />
            </div>
            <div>
              <Label htmlFor="s-match">Combinar</Label>
              <Select id="s-match" value={match} onChange={(e) => setMatch(e.target.value)}>
                <option value="all">Todas as regras</option>
                <option value="any">Qualquer regra</option>
              </Select>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            {rules.map((rule, index) => {
              const fieldKey = rule.field.startsWith("custom:") ? "custom" : rule.field;
              const def = RULE_FIELDS.find((f) => f.value === fieldKey);
              return (
                <div key={index} className="flex flex-wrap items-end gap-2 rounded-md border border-border-subtle bg-raised px-3 py-2.5">
                  <Select
                    className="w-[150px]"
                    value={fieldKey}
                    onChange={(e) => {
                      const next = RULE_FIELDS.find((f) => f.value === e.target.value);
                      updateRule(index, {
                        field: e.target.value === "custom" ? "custom:" : e.target.value,
                        op: next?.ops[0] ?? "contains",
                        value: "",
                      });
                    }}
                  >
                    {RULE_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </Select>

                  {fieldKey === "custom" && (
                    <Input
                      className="w-[140px]"
                      placeholder="nome do campo"
                      value={rule.field.slice(7)}
                      onChange={(e) => updateRule(index, { field: `custom:${e.target.value}` })}
                    />
                  )}

                  <Select
                    className="w-[140px]"
                    value={rule.op}
                    onChange={(e) => updateRule(index, { op: e.target.value })}
                  >
                    {(def?.ops ?? []).map((o) => <option key={o} value={o}>{OP_LABEL[o]}</option>)}
                  </Select>

                  {!OPS_WITHOUT_VALUE.has(rule.op) && (
                    rule.field === "tag" ? (
                      <Select className="flex-1" value={rule.value ?? ""} onChange={(e) => updateRule(index, { value: e.target.value })}>
                        <option value="">Escolha a etiqueta</option>
                        {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </Select>
                    ) : (
                      <Input
                        className="flex-1"
                        type={rule.field === "createdAt" || rule.field === "lastSeenAt" ? "date" : "text"}
                        value={rule.value ?? ""}
                        onChange={(e) => updateRule(index, { value: e.target.value })}
                      />
                    )
                  )}

                  <button
                    onClick={() => setRules(rules.filter((_, i) => i !== index))}
                    className="rounded-md p-1.5 text-text-tertiary hover:bg-danger-subtle hover:text-danger"
                    aria-label="Remover regra"
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                </div>
              );
            })}

            <Button
              variant="secondary"
              onClick={() => setRules([...rules, { field: "tag", op: "has", value: "" }])}
              className="self-start"
            >
              <Plus size={14} aria-hidden="true" /> Adicionar regra
            </Button>

            {rules.length === 0 && (
              <p className="text-caption text-text-tertiary">
                Sem regra nenhuma, o segmento pega todos os contatos do agente.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border-subtle pt-4">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} loading={saving} disabled={!name.trim()}>
              Salvar
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
