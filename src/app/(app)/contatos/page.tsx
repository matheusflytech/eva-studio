"use client";

import * as React from "react";
import {
  Users, Search, Plus, Upload, Tag as TagIcon, Filter, X, Trash2,
  Mail, Phone, BellOff, BellRing, Loader2,
} from "lucide-react";
import { useAgentsStore } from "@/lib/stores/agents-store";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalContent } from "@/components/ui/modal";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ContactActivity } from "@/components/crm/contact-activity";
import { formatRelativeDate } from "@/lib/utils";

interface ContactTag {
  id: string;
  name: string;
  color: string;
}

interface ContactChannelRow {
  id: string;
  agentId: string;
  channel: string;
  externalId: string;
}

interface Contact {
  id: string;
  name: string;
  jobTitle: string;
  email: string;
  phone: string;
  notes: string;
  customFields: Record<string, unknown>;
  source: string;
  optIn: boolean;
  company: { id: string; name: string } | null;
  lastSeenAt: string;
  createdAt: string;
  tags: ContactTag[];
  channels: ContactChannelRow[];
}

interface TagRow extends ContactTag {
  contactCount: number;
}

interface SegmentRule {
  field: string;
  op: string;
  value?: string;
}

interface SegmentRow {
  id: string;
  name: string;
  match: string;
  rules: SegmentRule[];
  contactCount: number;
}

const CHANNEL_LABEL: Record<string, string> = {
  whatsapp_qr: "WhatsApp (QR)",
  whatsapp_meta: "WhatsApp (oficial)",
  instagram: "Instagram",
  telegram: "Telegram",
  messenger: "Messenger",
  tiktok: "TikTok",
  website: "Site",
  playground: "Playground",
};

const SOURCE_LABEL: Record<string, string> = {
  conversa: "Conversa",
  importacao: "Importação",
  api: "API",
  manual: "Manual",
};

// Campos que o construtor de regra oferece. Campo livre ("custom:") é digitado
// pelo usuário, porque cada agente captura uma coisa diferente.
const RULE_FIELDS = [
  { value: "name", label: "Nome", ops: ["contains", "equals", "is_empty", "not_empty"] },
  { value: "email", label: "E-mail", ops: ["contains", "equals", "is_empty", "not_empty"] },
  { value: "phone", label: "Telefone", ops: ["contains", "equals", "is_empty", "not_empty"] },
  { value: "channel", label: "Canal", ops: ["equals", "not_equals"] },
  { value: "source", label: "Origem", ops: ["equals", "not_equals"] },
  { value: "optIn", label: "Opt-in", ops: ["is_true", "is_false"] },
  { value: "tag", label: "Etiqueta", ops: ["has", "not_has"] },
  { value: "createdAt", label: "Criado em", ops: ["before", "after"] },
  { value: "lastSeenAt", label: "Visto por último", ops: ["before", "after"] },
  { value: "custom", label: "Campo livre", ops: ["contains", "equals", "not_equals", "is_empty", "not_empty"] },
];

const OP_LABEL: Record<string, string> = {
  contains: "contém",
  equals: "é igual a",
  not_equals: "é diferente de",
  is_empty: "está vazio",
  not_empty: "está preenchido",
  has: "tem",
  not_has: "não tem",
  before: "antes de",
  after: "depois de",
  is_true: "é sim",
  is_false: "é não",
};

const OPS_WITHOUT_VALUE = new Set(["is_empty", "not_empty", "is_true", "is_false"]);

function initials(name: string, fallback: string): string {
  const base = name.trim() || fallback;
  const parts = base.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function ContatosPage() {
  const { agents, isLoaded, load } = useAgentsStore();
  const [agentId, setAgentId] = React.useState<string | null>(null);

  const [contacts, setContacts] = React.useState<Contact[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [tags, setTags] = React.useState<TagRow[]>([]);
  const [segments, setSegments] = React.useState<SegmentRow[]>([]);

  const [query, setQuery] = React.useState("");
  const [tagFilter, setTagFilter] = React.useState("");
  const [segmentFilter, setSegmentFilter] = React.useState("");

  const [selected, setSelected] = React.useState<Contact | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isLoaded) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoaded]);

  React.useEffect(() => {
    if (!agentId && agents.length > 0) setAgentId(agents[0].id);
  }, [agentId, agents]);

  const refreshContacts = React.useCallback(async () => {
    setIsLoading(true);
    const params = new URLSearchParams({ page: String(page) });
    if (query.trim()) params.set("q", query.trim());
    if (tagFilter) params.set("tag", tagFilter);
    if (segmentFilter) params.set("segment", segmentFilter);
    const res = await fetch(`/api/contacts?${params}`);
    const data = await res.json();
    setContacts(data.contacts ?? []);
    setTotal(data.total ?? 0);
    setIsLoading(false);
  }, [page, query, tagFilter, segmentFilter]);

  const refreshTags = React.useCallback(async () => {
    const res = await fetch(`/api/tags`);
    const data = await res.json();
    setTags(data.tags ?? []);
  }, []);

  const refreshSegments = React.useCallback(async () => {
    const res = await fetch(`/api/segments`);
    const data = await res.json();
    setSegments(data.segments ?? []);
  }, []);

  React.useEffect(() => {
    refreshTags();
    refreshSegments();
  }, [refreshTags, refreshSegments]);

  // Busca com atraso: digitar num campo que consulta o banco a cada tecla
  // é o jeito mais rápido de estourar o pool de conexões.
  React.useEffect(() => {
    const timer = setTimeout(() => refreshContacts(), 300);
    return () => clearTimeout(timer);
  }, [refreshContacts]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-primary">Contatos</h1>
          <p className="mt-1 text-[15px] text-text-secondary">
            A ficha de quem falou com o agente: quem é, o que foi capturado e em que etiqueta caiu.
          </p>
        </div>

      </header>

      {error && (
        <div className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">{error}</div>
      )}

      <Tabs defaultValue="contatos">
        <TabsList>
          <TabsTrigger value="contatos">Contatos</TabsTrigger>
          <TabsTrigger value="etiquetas">Etiquetas</TabsTrigger>
          <TabsTrigger value="segmentos">Segmentos</TabsTrigger>
        </TabsList>

        <TabsContent value="contatos" className="mt-6">
          <ContactsTab
            agentId={agentId}
            contacts={contacts}
            total={total}
            page={page}
            setPage={setPage}
            tags={tags}
            segments={segments}
            query={query}
            setQuery={setQuery}
            tagFilter={tagFilter}
            setTagFilter={setTagFilter}
            segmentFilter={segmentFilter}
            setSegmentFilter={setSegmentFilter}
            isLoading={isLoading}
            onSelect={setSelected}
            onChanged={() => { refreshContacts(); refreshTags(); }}
            onError={setError}
          />
        </TabsContent>

        <TabsContent value="etiquetas" className="mt-6">
          <TagsTab agentId={agentId} tags={tags} onChanged={refreshTags} onError={setError} />
        </TabsContent>

        <TabsContent value="segmentos" className="mt-6">
          <SegmentsTab agentId={agentId} segments={segments} tags={tags} onChanged={refreshSegments} onError={setError} />
        </TabsContent>
      </Tabs>

      {selected && agentId && (
        <ContactDrawer
          agentId={agentId}
          contact={selected}
          tags={tags}
          onClose={() => setSelected(null)}
          onChanged={(updated) => {
            setSelected(updated);
            refreshContacts();
            refreshTags();
          }}
          onDeleted={() => {
            setSelected(null);
            refreshContacts();
            refreshTags();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba Contatos
// ---------------------------------------------------------------------------

function ContactsTab({
  agentId, contacts, total, page, setPage, tags, segments,
  query, setQuery, tagFilter, setTagFilter, segmentFilter, setSegmentFilter,
  isLoading, onSelect, onChanged, onError,
}: {
  agentId: string | null;
  contacts: Contact[];
  total: number;
  page: number;
  setPage: (n: number) => void;
  tags: TagRow[];
  segments: SegmentRow[];
  query: string;
  setQuery: (v: string) => void;
  tagFilter: string;
  setTagFilter: (v: string) => void;
  segmentFilter: string;
  setSegmentFilter: (v: string) => void;
  isLoading: boolean;
  onSelect: (c: Contact) => void;
  onChanged: () => void;
  onError: (e: string | null) => void;
}) {
  const [showNew, setShowNew] = React.useState(false);
  const [showImport, setShowImport] = React.useState(false);
  const hasFilter = !!query.trim() || !!tagFilter || !!segmentFilter;
  const totalPages = Math.max(1, Math.ceil(total / 50));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[240px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder="Buscar por nome, e-mail, telefone..."
            value={query}
            onChange={(e) => { setQuery(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>

        <Select value={tagFilter} onChange={(e) => { setTagFilter(e.target.value); setPage(1); }} className="w-[180px]">
          <option value="">Todas as etiquetas</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.contactCount})</option>
          ))}
        </Select>

        <Select value={segmentFilter} onChange={(e) => { setSegmentFilter(e.target.value); setPage(1); }} className="w-[180px]">
          <option value="">Todos os segmentos</option>
          {segments.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.contactCount})</option>
          ))}
        </Select>

        {hasFilter && (
          <Button
            variant="ghost"
            onClick={() => { setQuery(""); setTagFilter(""); setSegmentFilter(""); setPage(1); }}
          >
            <X size={15} /> Limpar
          </Button>
        )}

        <div className="ml-auto flex gap-2">
          <Button variant="secondary" onClick={() => setShowImport(true)}>
            <Upload size={15} /> Importar CSV
          </Button>
          <Button onClick={() => setShowNew(true)}>
            <Plus size={15} /> Novo contato
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-3">
          <span className="text-[13px] text-text-secondary">
            {isLoading ? "Carregando..." : `${total} contato${total === 1 ? "" : "s"}`}
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-[13px] text-text-secondary">
              <Button variant="ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button>
              <span>{page} de {totalPages}</span>
              <Button variant="ghost" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Próxima</Button>
            </div>
          )}
        </div>

        {contacts.length === 0 ? (
          <div className="px-5 py-16 text-center text-[14px] text-text-secondary">
            {hasFilter
              ? "Nenhum contato bate com esse filtro."
              : "Ainda não há contatos. Eles aparecem sozinhos quando alguém conversa com o agente."}
          </div>
        ) : (
          <table className="w-full text-left text-[14px]">
            <thead className="text-[12px] uppercase tracking-wide text-text-tertiary">
              <tr className="border-b border-border-subtle">
                <th className="px-5 py-2.5 font-medium">Contato</th>
                <th className="px-5 py-2.5 font-medium">Canais</th>
                <th className="px-5 py-2.5 font-medium">Etiquetas</th>
                <th className="px-5 py-2.5 font-medium">Origem</th>
                <th className="px-5 py-2.5 font-medium">Visto</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr
                  key={c.id}
                  onClick={() => onSelect(c)}
                  className="cursor-pointer border-b border-border-subtle/60 transition-colors last:border-0 hover:bg-surface-2/60"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-3 text-[12px] font-semibold text-text-secondary">
                        {initials(c.name, c.email || c.phone)}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 truncate font-medium text-text-primary">
                          {c.name || c.email || c.phone || "Sem nome"}
                          {!c.optIn && <BellOff size={13} className="shrink-0 text-text-tertiary" />}
                        </div>
                        <div className="truncate text-[12px] text-text-tertiary">
                          {c.company?.name || c.email || c.phone || "—"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-text-secondary">
                    {c.channels.length === 0
                      ? "—"
                      : c.channels.length === 1
                        ? CHANNEL_LABEL[c.channels[0].channel] ?? c.channels[0].channel
                        : `${c.channels.length} canais`}
                  </td>
                  <td className="px-5 py-3">
                    <div className="flex flex-wrap gap-1.5">
                      {c.tags.slice(0, 3).map((t) => (
                        <Badge key={t.id}>{t.name}</Badge>
                      ))}
                      {c.tags.length > 3 && <Badge>+{c.tags.length - 3}</Badge>}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-text-secondary">{SOURCE_LABEL[c.source] ?? c.source}</td>
                  <td className="px-5 py-3 text-text-tertiary">{formatRelativeDate(c.lastSeenAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {showNew && agentId && (
        <NewContactModal
          agentId={agentId}
          onClose={() => setShowNew(false)}
          onCreated={() => { setShowNew(false); onChanged(); }}
          onError={onError}
        />
      )}
      {showImport && agentId && (
        <ImportModal
          agentId={agentId}
          tags={tags}
          onClose={() => setShowImport(false)}
          onDone={() => { setShowImport(false); onChanged(); }}
        />
      )}
    </div>
  );
}

function NewContactModal({
  agentId, onClose, onCreated, onError,
}: { agentId: string; onClose: () => void; onCreated: () => void; onError: (e: string | null) => void }) {
  const [form, setForm] = React.useState({ name: "", email: "", phone: "", channel: "whatsapp_meta" });
  const [saving, setSaving] = React.useState(false);

  async function save() {
    setSaving(true);
    onError(null);
    const res = await fetch(`/api/contacts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    setSaving(false);
    if (!res.ok) {
      onError((await res.json()).error ?? "Não foi possível criar o contato.");
      return;
    }
    onCreated();
  }

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent title="Novo contato" description="Cadastro manual, sem precisar esperar a pessoa escrever.">
        <div className="flex flex-col gap-4">
          <div>
            <Label htmlFor="c-nome">Nome</Label>
            <Input id="c-nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="c-email">E-mail</Label>
              <Input id="c-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="c-fone">Telefone</Label>
              <Input id="c-fone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="5511999999999" />
            </div>
          </div>
          <div>
            <Label htmlFor="c-canal">Canal</Label>
            <Select id="c-canal" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value })}>
              <option value="whatsapp_meta">WhatsApp (oficial)</option>
              <option value="whatsapp_qr">WhatsApp (QR)</option>
              <option value="telegram">Telegram</option>
              <option value="instagram">Instagram</option>
              <option value="website">Site</option>
            </Select>
            <p className="mt-1.5 text-[12px] text-text-tertiary">
              O telefone vira o identificador de envio nesse canal. Sem ele o contato existe, mas não recebe disparo.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 size={15} className="animate-spin" />} Criar
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}

function ImportModal({
  agentId, tags, onClose, onDone,
}: { agentId: string; tags: TagRow[]; onClose: () => void; onDone: () => void }) {
  const [csv, setCsv] = React.useState("");
  const [channel, setChannel] = React.useState("whatsapp_meta");
  const [tagId, setTagId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<{ created: number; updated: number; skipped: number; errors: string[] } | null>(null);

  async function handleFile(file: File) {
    setCsv(await file.text());
  }

  async function run() {
    setBusy(true);
    const res = await fetch(`/api/contacts/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv, channel, tagId: tagId || undefined }),
    });
    const data = await res.json();
    setBusy(false);
    setResult(res.ok ? data : { created: 0, updated: 0, skipped: 0, errors: [data.error ?? "Falhou."] });
  }

  return (
    <Modal open onOpenChange={(open) => !open && onClose()}>
      <ModalContent
        title="Importar contatos"
        description="CSV com cabeçalho. Colunas nome, e-mail e telefone são reconhecidas sozinhas; o resto vira campo livre."
      >
        {result ? (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-3 text-center">
              {[
                { label: "Criados", value: result.created },
                { label: "Atualizados", value: result.updated },
                { label: "Ignorados", value: result.skipped },
              ].map((s) => (
                <div key={s.label} className="rounded-2xl bg-surface-2 px-3 py-4">
                  <div className="font-display text-2xl font-semibold text-text-primary">{s.value}</div>
                  <div className="text-[12px] text-text-tertiary">{s.label}</div>
                </div>
              ))}
            </div>
            {result.errors.length > 0 && (
              <ul className="flex flex-col gap-1 rounded-2xl bg-surface-2 px-4 py-3 text-[13px] text-text-secondary">
                {result.errors.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            )}
            <div className="flex justify-end">
              <Button onClick={onDone}>Pronto</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <Label htmlFor="csv-file">Arquivo</Label>
              <input
                id="csv-file"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                className="mt-1.5 block w-full text-[13px] text-text-secondary file:mr-3 file:rounded-lg file:border-0 file:bg-surface-3 file:px-3 file:py-2 file:text-[13px] file:text-text-primary"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="imp-canal">Canal</Label>
                <Select id="imp-canal" value={channel} onChange={(e) => setChannel(e.target.value)}>
                  <option value="whatsapp_meta">WhatsApp (oficial)</option>
                  <option value="whatsapp_qr">WhatsApp (QR)</option>
                  <option value="telegram">Telegram</option>
                </Select>
              </div>
              <div>
                <Label htmlFor="imp-tag">Etiquetar como</Label>
                <Select id="imp-tag" value={tagId} onChange={(e) => setTagId(e.target.value)}>
                  <option value="">Nenhuma</option>
                  {tags.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </div>
            </div>
            {csv && (
              <p className="text-[12px] text-text-tertiary">
                {csv.split("\n").filter((l) => l.trim()).length - 1} linha(s) prontas para importar.
              </p>
            )}
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="ghost" onClick={onClose}>Cancelar</Button>
              <Button onClick={run} disabled={!csv || busy}>
                {busy && <Loader2 size={15} className="animate-spin" />} Importar
              </Button>
            </div>
          </div>
        )}
      </ModalContent>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Painel lateral do contato
// ---------------------------------------------------------------------------

function ContactDrawer({
  agentId, contact, tags, onClose, onChanged, onDeleted,
}: {
  agentId: string;
  contact: Contact;
  tags: TagRow[];
  onClose: () => void;
  onChanged: (c: Contact) => void;
  onDeleted: () => void;
}) {
  const [form, setForm] = React.useState({
    name: contact.name, email: contact.email, phone: contact.phone, notes: contact.notes,
  });
  const [saving, setSaving] = React.useState(false);
  const [aba, setAba] = React.useState("ficha");
  // Contador na aba: a pessoa precisa ver que há tarefa aberta sem trocar de aba.
  const [tarefasAbertas, setTarefasAbertas] = React.useState(0);

  React.useEffect(() => {
    setForm({ name: contact.name, email: contact.email, phone: contact.phone, notes: contact.notes });
  }, [contact]);

  async function patch(body: Record<string, unknown>) {
    setSaving(true);
    const res = await fetch(`/api/contacts/${contact.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (res.ok) {
      const data = await res.json();
      if (data.contact) onChanged(data.contact);
    }
  }

  async function remove() {
    await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" });
    onDeleted();
  }

  const available = tags.filter((t) => !contact.tags.some((ct) => ct.id === t.id));
  const custom = Object.entries(contact.customFields ?? {});

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-label="Detalhes do contato">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      {/* glass-card-solid: sem ele o conteúdo da página aparece por baixo do painel. */}
      <aside className="glass-card glass-card-solid relative z-10 flex h-full w-full max-w-[460px] flex-col overflow-y-auto rounded-l-3xl p-6">
        <div className="mb-5 flex items-start justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-3 text-[14px] font-semibold text-text-secondary">
              {initials(contact.name, contact.email || contact.phone)}
            </span>
            <div>
              <h2 className="font-display text-lg font-semibold text-text-primary">
                {contact.name || contact.email || contact.phone || "Sem nome"}
              </h2>
              <p className="text-[12px] text-text-tertiary">
                {contact.company?.name ?? "Sem empresa"}
                {contact.channels.length > 0 &&
                  ` · ${contact.channels.map((ch) => CHANNEL_LABEL[ch.channel] ?? ch.channel).join(", ")}`}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-lg p-1.5 text-text-tertiary hover:bg-surface-2 hover:text-text-primary">
            <X size={18} />
          </button>
        </div>

        <Tabs value={aba} onValueChange={setAba}>
          <TabsList className="mb-4 w-full">
            <TabsTrigger value="ficha" className="flex-1">Ficha</TabsTrigger>
            <TabsTrigger value="atividade" className="flex-1">
              Atividade{tarefasAbertas > 0 ? ` (${tarefasAbertas})` : ""}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="atividade">
            <ContactActivity contactId={contact.id} onCountsChange={setTarefasAbertas} />
          </TabsContent>

          <TabsContent value="ficha" className="flex flex-col gap-5">
          <section className="flex flex-col gap-3">
            <div>
              <Label htmlFor="d-nome">Nome</Label>
              <Input id="d-nome" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} onBlur={() => patch({ name: form.name })} />
            </div>
            <div>
              <Label htmlFor="d-email">E-mail</Label>
              <Input id="d-email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} onBlur={() => patch({ email: form.email })} />
            </div>
            <div>
              <Label htmlFor="d-fone">Telefone</Label>
              <Input id="d-fone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={() => patch({ phone: form.phone })} />
            </div>
          </section>

          <section>
            <Label>Etiquetas</Label>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {contact.tags.map((t) => (
                <button
                  key={t.id}
                  onClick={() => patch({ removeTagId: t.id })}
                  className="group inline-flex items-center gap-1.5 rounded-full bg-surface-3 px-2.5 py-1 text-[12px] font-medium text-text-secondary transition-colors hover:bg-danger/12 hover:text-danger"
                >
                  {t.name}
                  <X size={11} className="opacity-0 transition-opacity group-hover:opacity-100" />
                </button>
              ))}
              {contact.tags.length === 0 && (
                <span className="text-[13px] text-text-tertiary">Nenhuma etiqueta.</span>
              )}
            </div>
            {available.length > 0 && (
              <Select
                className="mt-2"
                value=""
                onChange={(e) => e.target.value && patch({ addTagId: e.target.value })}
              >
                <option value="">+ Aplicar etiqueta</option>
                {available.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
            )}
            <p className="mt-1.5 text-[12px] text-text-tertiary">
              Aplicar uma etiqueta pode inscrever o contato numa sequência, se houver alguma com esse gatilho.
            </p>
          </section>

          {custom.length > 0 && (
            <section>
              <Label>Capturado no fluxo</Label>
              <dl className="mt-1.5 flex flex-col gap-1.5 rounded-2xl bg-surface-2 px-4 py-3">
                {custom.map(([key, value]) => (
                  <div key={key} className="flex items-start justify-between gap-4 text-[13px]">
                    <dt className="text-text-tertiary">{key}</dt>
                    <dd className="max-w-[60%] break-words text-right text-text-primary">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section>
            <Label htmlFor="d-notas">Anotações</Label>
            <Textarea
              id="d-notas"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              onBlur={() => patch({ notes: form.notes })}
            />
          </section>

          <section className="flex items-center justify-between rounded-2xl bg-surface-2 px-4 py-3">
            <div className="flex items-center gap-2.5">
              {contact.optIn ? <BellRing size={16} className="text-text-secondary" /> : <BellOff size={16} className="text-text-tertiary" />}
              <div>
                <div className="text-[13px] font-medium text-text-primary">
                  {contact.optIn ? "Aceita receber mensagens" : "Saiu da lista"}
                </div>
                <div className="text-[12px] text-text-tertiary">
                  {contact.optIn ? "Entra em disparo e sequência." : "Fica fora de todo envio em massa."}
                </div>
              </div>
            </div>
            <Button variant="secondary" onClick={() => patch({ optIn: !contact.optIn })} disabled={saving}>
              {contact.optIn ? "Remover" : "Reativar"}
            </Button>
          </section>

          <div className="flex items-center justify-between border-t border-border-subtle pt-4">
            <div className="flex gap-3 text-[12px] text-text-tertiary">
              {contact.email && <span className="inline-flex items-center gap-1"><Mail size={12} /> {contact.email}</span>}
              {contact.phone && <span className="inline-flex items-center gap-1"><Phone size={12} /> {contact.phone}</span>}
            </div>
            <Button variant="ghost" onClick={remove} className="text-danger hover:bg-danger/10">
              <Trash2 size={15} /> Apagar
            </Button>
          </div>
          </TabsContent>
        </Tabs>
      </aside>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Aba Etiquetas
// ---------------------------------------------------------------------------

function TagsTab({
  agentId, tags, onChanged, onError,
}: { agentId: string | null; tags: TagRow[]; onChanged: () => void; onError: (e: string | null) => void }) {
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function create() {
    if (!agentId || !name.trim()) return;
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

  async function remove(id: string) {
    if (!agentId) return;
    await fetch(`/api/tags/${id}`, { method: "DELETE" });
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
            <Plus size={15} /> Criar
          </Button>
        </div>
      </Card>

      {tags.length === 0 ? (
        <EmptyState
          icon={<TagIcon size={36} className="text-text-tertiary" />}
          title="Nenhuma etiqueta ainda"
          description="Crie a primeira acima. Elas aparecem na ficha de cada contato e nos filtros."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tags.map((t) => (
            <Card key={t.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium text-text-primary">{t.name}</div>
                <div className="text-[12px] text-text-tertiary">
                  {t.contactCount} contato{t.contactCount === 1 ? "" : "s"}
                </div>
              </div>
              <button
                onClick={() => remove(t.id)}
                className="shrink-0 rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-danger/10 hover:text-danger"
                aria-label={`Apagar etiqueta ${t.name}`}
              >
                <Trash2 size={15} />
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

function SegmentsTab({
  agentId, segments, tags, onChanged, onError,
}: {
  agentId: string | null;
  segments: SegmentRow[];
  tags: TagRow[];
  onChanged: () => void;
  onError: (e: string | null) => void;
}) {
  const [editing, setEditing] = React.useState<SegmentRow | "new" | null>(null);

  async function remove(id: string) {
    if (!agentId) return;
    await fetch(`/api/segments/${id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="max-w-xl text-[14px] text-text-secondary">
          Segmento é um público salvo: em vez de colar uma lista de números, você descreve quem deve receber e o
          número de pessoas se atualiza sozinho.
        </p>
        <Button onClick={() => setEditing("new")}>
          <Plus size={15} /> Novo segmento
        </Button>
      </div>

      {segments.length === 0 ? (
        <EmptyState
          icon={<Filter size={36} className="text-text-tertiary" />}
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
                  <div className="text-[12px] text-text-tertiary">
                    {s.contactCount} contato{s.contactCount === 1 ? "" : "s"} agora ·{" "}
                    {s.match === "any" ? "qualquer regra" : "todas as regras"}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button variant="ghost" onClick={() => setEditing(s)}>Editar</Button>
                  <button
                    onClick={() => remove(s.id)}
                    className="rounded-lg p-1.5 text-text-tertiary transition-colors hover:bg-danger/10 hover:text-danger"
                    aria-label={`Apagar segmento ${s.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
              <ul className="flex flex-col gap-1 text-[12px] text-text-secondary">
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

      {editing && agentId && (
        <SegmentEditor
          agentId={agentId}
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
  agentId, segment, tags, onClose, onSaved, onError,
}: {
  agentId: string;
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
                <div key={index} className="flex flex-wrap items-end gap-2 rounded-2xl bg-surface-2 px-3 py-2.5">
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
                    className="rounded-lg p-1.5 text-text-tertiary hover:bg-danger/10 hover:text-danger"
                    aria-label="Remover regra"
                  >
                    <X size={15} />
                  </button>
                </div>
              );
            })}

            <Button
              variant="secondary"
              onClick={() => setRules([...rules, { field: "tag", op: "has", value: "" }])}
              className="self-start"
            >
              <Plus size={15} /> Adicionar regra
            </Button>

            {rules.length === 0 && (
              <p className="text-[12px] text-text-tertiary">
                Sem regra nenhuma, o segmento pega todos os contatos do agente.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border-subtle pt-4">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={saving || !name.trim()}>
              {saving && <Loader2 size={15} className="animate-spin" />} Salvar
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}

