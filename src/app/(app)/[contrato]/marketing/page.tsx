"use client";

import * as React from "react";
import Link from "@/components/contrato/link";
import { useSearchParams } from "@/lib/contrato/navegacao";
import { Archive, ArchiveRestore, ChevronDown, ChevronRight, Copy, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/lib/auth/auth-context";
import { permite } from "@/lib/permissoes/catalogo";
import { janelaDoPainel } from "@/lib/consulta";
import { CHANNEL_LABEL, type TouchChannel } from "@/lib/marketing/touch";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Marketing (M1): de onde vieram os contatos, quanto custou e quanto voltou.
// Sem conta de anúncio conectada: o investimento é lançado à mão e casa com a
// UTM pelo nome (fonte + campanha). O "% com origem" fica sempre à vista:
// ROAS de metade dos negócios engana quem lê.
// Spec: docs/superpowers/specs/2026-10-29-marketing-origem-design.md
// ---------------------------------------------------------------------------

interface Row {
  source: string | null;
  campaign: string;
  spendCents: number;
  leads: number;
  deals: number;
  won: number;
  revenueCents: number;
  cplCents: number | null;
  cacCents: number | null;
  roas: number | null;
  dealList: { id: string; name: string }[];
}
interface Summary {
  from: string;
  to: string;
  totals: Omit<Row, "source" | "campaign" | "dealList"> & { dealsWithOrigin: number; originPct: number | null };
  rows: Row[];
}
interface Spend { id: string; source: string; campaign: string; from: string; to: string; amountCents: number; note: string }
interface TrackedLink {
  id: string; code: string; name: string; phone: string; message: string; clicks: number; contacts: number; archivedAt: string | null;
  utmSource: string | null; utmMedium: string | null; utmCampaign: string | null; utmContent: string | null;
}
interface WaNumber { label: string; phone: string; agentId: string | null }

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = (c: number | null) => (c === null ? "—" : brl.format(c / 100));
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const roasText = (v: number | null) => (v === null ? "—" : `${v.toFixed(2).replace(".", ",")}x`);
const dateBr = (d: string) => d.split("-").reverse().join("/");

/** Rótulo da fonte: utm_source como veio; sem ela, o nome do canal. */
function sourceLabel(s: string | null) {
  if (s === null) return "Sem origem";
  return CHANNEL_LABEL[s as TouchChannel] ?? s;
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init ? { ...init, headers: { "Content-Type": "application/json" } } : undefined);
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error ?? "Não deu certo. Tente de novo.");
  return j as T;
}

const PERIODS = [
  { value: "7", label: "7 dias" },
  { value: "30", label: "30 dias" },
  { value: "90", label: "90 dias" },
  { value: "custom", label: "Escolher datas" },
];

export default function MarketingPage() {
  return (
    <React.Suspense fallback={null}>
      <Marketing />
    </React.Suspense>
  );
}

function Marketing() {
  const params = useSearchParams();
  const qs = params.toString();
  const { session } = useAuth();
  const canEdit = !!session?.superadmin || permite(session?.permissoes ?? [], "marketing:editar");

  const url = new URLSearchParams(qs);
  const days = Number(url.get("days")) || 30;
  const custom = !!(url.get("from") && url.get("to"));
  const window_ = janelaDoPainel(days, url.get("from") ?? undefined, url.get("to") ?? undefined);
  // A URL é o estado (link compartilhável), como no Dashboard.
  const setUrl = (p: Record<string, string>) => {
    const q = new URLSearchParams(p).toString();
    window.history.replaceState(null, "", `${window.location.pathname}${q ? `?${q}` : ""}`);
  };

  const [summary, setSummary] = React.useState<Summary | null>(null);
  const [error, setError] = React.useState("");
  const [reload, setReload] = React.useState(0);
  const refresh = React.useCallback(() => setReload((n) => n + 1), []);

  React.useEffect(() => {
    let alive = true;
    api<Summary>(`/api/marketing/summary?from=${window_.de}&to=${window_.ate}`)
      .then((s) => {
        if (!alive) return;
        setSummary(s);
        setError("");
      })
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [window_.de, window_.ate, reload]);

  return (
    <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-title font-semibold text-text-primary">Marketing</h1>
          <p className="mt-1 text-small text-text-secondary">
            De onde vieram os contatos, quanto custou e quanto voltou. {dateBr(window_.de)} a {dateBr(window_.ate)}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SegmentedControl
            label="Período"
            options={PERIODS}
            value={custom ? "custom" : String(days)}
            onChange={(v) => (v === "custom" ? setUrl({ from: window_.de, to: window_.ate }) : setUrl({ days: v }))}
          />
          {custom && (
            <div className="flex items-center gap-1">
              <Input type="date" aria-label="De" value={window_.de} onChange={(e) => e.target.value && setUrl({ from: e.target.value, to: window_.ate })} className="w-[150px]" />
              <Input type="date" aria-label="Até" value={window_.ate} onChange={(e) => e.target.value && setUrl({ from: window_.de, to: e.target.value })} className="w-[150px]" />
            </div>
          )}
        </div>
      </header>

      {error && <p role="alert" className="text-small text-danger">{error}</p>}
      <SummaryTiles summary={summary} />
      <OriginTable summary={summary} />
      <SpendSection canEdit={canEdit} onChange={refresh} />
      <LinksSection canEdit={canEdit} />
      <InstallSection />
    </div>
  );
}

function Section({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-[14px] border border-border-subtle bg-panel p-4 md:p-5", className)} aria-label={title}>
      <h2 className="text-body-lg font-semibold text-text-primary">{title}</h2>
      {description && <p className="mt-1 text-small text-text-secondary">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SummaryTiles({ summary }: { summary: Summary | null }) {
  const t = summary?.totals;
  const tiles: { label: string; value: string; hint?: string }[] = [
    { label: "Investimento", value: t ? money(t.spendCents) : "…" },
    { label: "Leads", value: t ? String(t.leads) : "…", hint: "Contatos cujo 1º toque foi no período" },
    { label: "Negócios", value: t ? String(t.deals) : "…" },
    { label: "Vendas", value: t ? String(t.won) : "…" },
    { label: "Receita", value: t ? money(t.revenueCents) : "…" },
    { label: "CPL", value: t ? money(t.cplCents) : "…", hint: "Custo por lead" },
    { label: "CAC", value: t ? money(t.cacCents) : "…", hint: "Custo por venda" },
    { label: "ROAS", value: t ? roasText(t.roas) : "…", hint: "Receita ÷ investimento" },
    { label: "Negócios com origem", value: t ? pct(t.originPct) : "…", hint: t ? `${t.dealsWithOrigin} de ${t.deals}` : undefined },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {tiles.map((x) => (
        <div key={x.label} className="rounded-[14px] border border-border-subtle bg-panel p-3">
          <p className="text-caption text-text-secondary">{x.label}</p>
          <p className="mt-1 text-title font-semibold tabular-nums text-text-primary">{x.value}</p>
          {x.hint && <p className="mt-0.5 text-caption text-text-tertiary">{x.hint}</p>}
        </div>
      ))}
    </div>
  );
}

function OriginTable({ summary }: { summary: Summary | null }) {
  const [open, setOpen] = React.useState<string | null>(null);
  const rows = summary?.rows ?? [];
  return (
    <Section title="Por origem e campanha" description="Negócios pela origem congelada na criação (último toque pago antes dele). Clique numa linha para ver os negócios.">
      {!summary ? (
        <p className="text-small text-text-secondary">Carregando…</p>
      ) : rows.length === 0 ? (
        <p className="text-small text-text-secondary">Nada no período. Lance um investimento ou crie um link rastreado abaixo.</p>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[820px] text-small">
            <thead>
              <tr className="border-b border-border-subtle text-left text-caption text-text-secondary">
                {["Fonte", "Campanha", "Investimento", "Leads", "Negócios", "Vendas", "Receita", "CPL", "CAC", "ROAS"].map((h, i) => (
                  <th key={h} scope="col" className={cn("py-2 pr-3 font-medium", i >= 2 && "text-right")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const key = `${r.source ?? ""}|${r.campaign}`;
                const isOpen = open === key;
                return (
                  <React.Fragment key={key}>
                    <tr className="border-b border-border-subtle hover:bg-hover">
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          className="flex items-center gap-1 text-left font-medium text-text-primary"
                          aria-expanded={isOpen}
                          onClick={() => setOpen(isOpen ? null : key)}
                          disabled={r.dealList.length === 0}
                        >
                          {r.dealList.length > 0 ? (isOpen ? <ChevronDown size={14} aria-hidden /> : <ChevronRight size={14} aria-hidden />) : <span className="w-[14px]" />}
                          {sourceLabel(r.source)}
                        </button>
                      </td>
                      <td className="py-2 pr-3 text-text-secondary">{r.campaign || "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{money(r.spendCents)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.leads}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.deals}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{r.won}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{money(r.revenueCents)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{money(r.cplCents)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{money(r.cacCents)}</td>
                      <td className="py-2 text-right tabular-nums">{roasText(r.roas)}</td>
                    </tr>
                    {isOpen && (
                      <tr className="border-b border-border-subtle bg-raised">
                        <td colSpan={10} className="px-6 py-2">
                          <ul className="flex flex-wrap gap-x-4 gap-y-1">
                            {r.dealList.map((d) => (
                              <li key={d.id}>
                                <Link href={`/deals/${d.id}`} className="text-accent hover:underline">{d.name}</Link>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

const EMPTY_SPEND = { source: "", campaign: "", from: "", to: "", amount: "", note: "" };

function SpendSection({ canEdit, onChange }: { canEdit: boolean; onChange: () => void }) {
  const toast = useToast();
  const [data, setData] = React.useState<{ spends: Spend[]; suggestions: { source: string; campaign: string }[] } | null>(null);
  const [form, setForm] = React.useState(EMPTY_SPEND);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const load = React.useCallback(() => api<NonNullable<typeof data>>("/api/marketing/spend").then(setData).catch(() => setData({ spends: [], suggestions: [] })), []);
  React.useEffect(() => {
    load();
  }, [load]);

  const sources = [...new Set((data?.suggestions ?? []).map((s) => s.source))];
  const campaigns = [...new Set((data?.suggestions ?? []).filter((s) => !form.source || s.source === form.source.trim().toLowerCase()).map((s) => s.campaign).filter(Boolean))];

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = JSON.stringify({ source: form.source, campaign: form.campaign, from: form.from, to: form.to, amountCents: Math.round(Number(form.amount) * 100), note: form.note });
      await api(editing ? `/api/marketing/spend/${editing}` : "/api/marketing/spend", { method: editing ? "PATCH" : "POST", body });
      toast({ title: editing ? "Investimento atualizado" : "Investimento lançado", tone: "success" });
      setForm(EMPTY_SPEND);
      setEditing(null);
      load();
      onChange();
    } catch (err) {
      toast({ title: (err as Error).message, tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function remove(s: Spend) {
    if (!window.confirm(`Apagar o investimento de ${money(s.amountCents)} em ${s.source}?`)) return;
    try {
      await api(`/api/marketing/spend/${s.id}`, { method: "DELETE" });
      load();
      onChange();
    } catch (err) {
      toast({ title: (err as Error).message, tone: "danger" });
    }
  }

  return (
    <Section title="Investimento" description="Quanto foi gasto por fonte e campanha. Use os mesmos nomes da UTM (utm_source e utm_campaign) para o custo juntar com os contatos. Campanha vazia vale para a fonte toda.">
      {canEdit && (
        <form onSubmit={save} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6 lg:items-end">
          <Field label="Fonte" required>
            <Input list="mk-sources" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="facebook" required />
          </Field>
          <Field label="Campanha">
            <Input list="mk-campaigns" value={form.campaign} onChange={(e) => setForm({ ...form, campaign: e.target.value })} placeholder="black-friday" />
          </Field>
          <Field label="De" required>
            <Input type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} required />
          </Field>
          <Field label="Até" required>
            <Input type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} required />
          </Field>
          <Field label="Valor (R$)" required>
            <Input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
          </Field>
          <div className="flex gap-2">
            <Button type="submit" loading={saving}>{editing ? "Salvar" : "Lançar"}</Button>
            {editing && (
              <Button type="button" variant="ghost" onClick={() => { setEditing(null); setForm(EMPTY_SPEND); }}>Cancelar</Button>
            )}
          </div>
          <datalist id="mk-sources">{sources.map((s) => <option key={s} value={s} />)}</datalist>
          <datalist id="mk-campaigns">{campaigns.map((c) => <option key={c} value={c} />)}</datalist>
        </form>
      )}
      <ul className={cn("divide-y divide-border-subtle", canEdit && "mt-4")}>
        {(data?.spends ?? []).map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-small">
            <span className="font-medium text-text-primary">{s.source}{s.campaign ? ` · ${s.campaign}` : ""}</span>
            <span className="text-text-secondary">{dateBr(s.from)} a {dateBr(s.to)}</span>
            <span className="ml-auto tabular-nums text-text-primary">{money(s.amountCents)}</span>
            {canEdit && (
              <span className="flex gap-1">
                <IconButton
                  tooltip
                  aria-label="Editar"
                  onClick={() => { setEditing(s.id); setForm({ source: s.source, campaign: s.campaign, from: s.from, to: s.to, amount: String(s.amountCents / 100), note: s.note }); }}
                >
                  <Pencil size={14} />
                </IconButton>
                <IconButton tooltip aria-label="Apagar" onClick={() => remove(s)}>
                  <Trash2 size={14} />
                </IconButton>
              </span>
            )}
          </li>
        ))}
        {data && data.spends.length === 0 && <li className="py-2 text-small text-text-secondary">Nenhum investimento lançado.</li>}
      </ul>
    </Section>
  );
}

const noop = () => () => {};

const EMPTY_LINK = { name: "", phone: "", agentId: "", message: "Olá! Quero saber mais.", utmSource: "", utmMedium: "", utmCampaign: "", utmContent: "" };

function LinksSection({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [data, setData] = React.useState<{ links: TrackedLink[]; numbers: WaNumber[] } | null>(null);
  const [form, setForm] = React.useState(EMPTY_LINK);
  const [saving, setSaving] = React.useState(false);
  // Endereço do app só no navegador (no servidor fica vazio, sem divergir na hidratação).
  const origin = React.useSyncExternalStore(noop, () => window.location.origin, () => "");
  const load = React.useCallback(() => api<NonNullable<typeof data>>("/api/marketing/links").then(setData).catch(() => setData({ links: [], numbers: [] })), []);
  React.useEffect(() => {
    load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("/api/marketing/links", { method: "POST", body: JSON.stringify(form) });
      toast({ title: "Link criado", tone: "success" });
      setForm(EMPTY_LINK);
      load();
    } catch (err) {
      toast({ title: (err as Error).message, tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function archive(l: TrackedLink) {
    try {
      await api(`/api/marketing/links/${l.id}`, { method: "PATCH", body: JSON.stringify({ archived: !l.archivedAt }) });
      load();
    } catch (err) {
      toast({ title: (err as Error).message, tone: "danger" });
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Link copiado", tone: "success" });
    } catch {
      toast({ title: "Não deu para copiar. Selecione o link e copie.", tone: "danger" });
    }
  }

  const numbers = data?.numbers ?? [];
  return (
    <Section
      title="Links rastreados"
      description='Link de WhatsApp para bio, QR code, e-mail ou anúncio. Quem clica abre a conversa com "(ref: CÓDIGO)" no fim da mensagem, e o contato fica com a origem do link.'
    >
      {canEdit && (
        <form onSubmit={create} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Nome" required>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bio do Instagram" required />
          </Field>
          {numbers.length > 0 ? (
            <Field label="Número do WhatsApp" required>
              <Select
                value={form.phone}
                onChange={(e) => {
                  const n = numbers.find((x) => x.phone === e.target.value);
                  setForm({ ...form, phone: e.target.value, agentId: n?.agentId ?? "" });
                }}
              >
                <option value="">Escolha…</option>
                {numbers.map((n) => <option key={n.phone} value={n.phone}>{n.label} · +{n.phone}</option>)}
              </Select>
            </Field>
          ) : (
            <Field label="Número do WhatsApp" hint="Com DDI e DDD, ex.: 5511999990000" required>
              <Input inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />
            </Field>
          )}
          <Field label="Mensagem inicial" className="sm:col-span-2">
            <Textarea rows={1} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </Field>
          <Field label="utm_source">
            <Input value={form.utmSource} onChange={(e) => setForm({ ...form, utmSource: e.target.value })} placeholder="instagram" />
          </Field>
          <Field label="utm_medium">
            <Input value={form.utmMedium} onChange={(e) => setForm({ ...form, utmMedium: e.target.value })} placeholder="bio" />
          </Field>
          <Field label="utm_campaign">
            <Input value={form.utmCampaign} onChange={(e) => setForm({ ...form, utmCampaign: e.target.value })} />
          </Field>
          <div className="flex items-end">
            <Button type="submit" loading={saving} disabled={!form.phone}>Criar link</Button>
          </div>
        </form>
      )}
      <ul className={cn("divide-y divide-border-subtle", canEdit && "mt-4")}>
        {(data?.links ?? []).map((l) => {
          const href = `${origin}/w/${l.code}`;
          return (
            <li key={l.id} className={cn("flex flex-wrap items-center gap-x-4 gap-y-1 py-2 text-small", l.archivedAt && "opacity-60")}>
              <span className="min-w-[160px] font-medium text-text-primary">{l.name}{l.archivedAt ? " (arquivado)" : ""}</span>
              <code className="text-text-secondary">{href}</code>
              <span className="text-text-secondary">{[l.utmSource, l.utmMedium, l.utmCampaign].filter(Boolean).join(" · ") || "sem UTM"}</span>
              <span className="ml-auto tabular-nums text-text-primary">{l.clicks} cliques · {l.contacts} contatos</span>
              <span className="flex gap-1">
                <IconButton tooltip aria-label="Copiar link" onClick={() => copy(href)}>
                  <Copy size={14} />
                </IconButton>
                {canEdit && (
                  <IconButton tooltip aria-label={l.archivedAt ? "Desarquivar" : "Arquivar"} onClick={() => archive(l)}>
                    {l.archivedAt ? <ArchiveRestore size={14} /> : <Archive size={14} />}
                  </IconButton>
                )}
              </span>
            </li>
          );
        })}
        {data && data.links.length === 0 && <li className="py-2 text-small text-text-secondary">Nenhum link criado.</li>}
      </ul>
    </Section>
  );
}

function InstallSection() {
  return (
    <Section title="Instalar no site" description="O widget da Eva no site já guarda a origem da visita (UTMs, gclid, fbclid) e marca os links de WhatsApp da página. Basta usar UTMs nos anúncios:">
      <dl className="grid gap-3 text-small">
        <div>
          <dt className="font-medium text-text-primary">Meta (parâmetros de URL do anúncio)</dt>
          <dd><code className="break-all text-text-secondary">utm_source=facebook&amp;utm_medium=paid&amp;utm_campaign={"{{campaign.name}}"}&amp;utm_id={"{{campaign.id}}"}&amp;utm_content={"{{ad.id}}"}</code></dd>
        </div>
        <div>
          <dt className="font-medium text-text-primary">Google Ads (modelo de acompanhamento)</dt>
          <dd><code className="break-all text-text-secondary">{"{lpurl}"}?utm_source=google&amp;utm_medium=cpc&amp;utm_campaign={"{campaignid}"}</code></dd>
        </div>
        <div>
          <dt className="font-medium text-text-primary">Anúncio que abre o WhatsApp, Instagram ou Messenger</dt>
          <dd className="text-text-secondary">Não precisa de nada: a Meta avisa qual anúncio trouxe a conversa (canais oficiais).</dd>
        </div>
      </dl>
    </Section>
  );
}
