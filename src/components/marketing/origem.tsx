"use client";

import * as React from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { MANUAL_SOURCES } from "@/lib/marketing/touch";

// "Origem" na ficha do contato e do negócio: de onde a pessoa veio (último e
// primeiro toque) e uma origem manual para quem souber (Indicação, Evento...).

interface Touch { label: string; utmSource: string | null; utmCampaign: string | null; paid: boolean; at: string }

function describe(t: Touch | null) {
  if (!t) return null;
  const manual = MANUAL_SOURCES.find((s) => s.value === t.utmSource)?.label;
  return [manual ?? t.utmSource ?? t.label, t.utmCampaign, t.paid ? "pago" : null].filter(Boolean).join(" · ");
}

export function OrigemDeMarketing({ contactId, dealId }: { contactId?: string; dealId?: string }) {
  const query = dealId ? `dealId=${dealId}` : `contactId=${contactId}`;
  const [data, setData] = React.useState<{ last: Touch | null; first: Touch | null } | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [source, setSource] = React.useState("indicacao");
  const [campaign, setCampaign] = React.useState("");
  const [error, setError] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(
    () =>
      fetch(`/api/marketing/origin?${query}`)
        .then((r) => (r.ok ? r.json() : null))
        .then(setData)
        .catch(() => setData(null)),
    [query]
  );
  React.useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    const r = await fetch("/api/marketing/origin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contactId, dealId, source, campaign }),
    }).catch(() => null);
    setSaving(false);
    if (!r?.ok) {
      setError((await r?.json().catch(() => null))?.error ?? "Não deu para salvar.");
      return;
    }
    setEditing(false);
    setCampaign("");
    load();
  }

  const last = describe(data?.last ?? null);
  const first = describe(data?.first ?? null);
  return (
    <div className="rounded-[18px] border border-border-subtle bg-panel p-4 text-small">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-text-primary">Origem</h3>
        {!editing && (
          <IconButton tooltip aria-label="Informar a origem" onClick={() => setEditing(true)}>
            <Pencil size={14} />
          </IconButton>
        )}
      </div>
      {!editing ? (
        <dl className="mt-1 grid gap-1">
          <div className="flex gap-2">
            <dt className="text-text-secondary">{dealId ? "Atribuída:" : "Último toque:"}</dt>
            <dd className="text-text-primary">{last ?? "Desconhecida"}</dd>
          </div>
          {first && first !== last && (
            <div className="flex gap-2">
              <dt className="text-text-secondary">Primeiro toque:</dt>
              <dd className="text-text-primary">{first}</dd>
            </div>
          )}
        </dl>
      ) : (
        <form onSubmit={save} className="mt-2 grid gap-2">
          <Select aria-label="Origem" value={source} onChange={(e) => setSource(e.target.value)}>
            {MANUAL_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </Select>
          <Input aria-label="Campanha (opcional)" placeholder="Campanha (opcional)" value={campaign} onChange={(e) => setCampaign(e.target.value)} />
          {error && (
            <p role="alert" className="text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" loading={saving}>
              Salvar
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
