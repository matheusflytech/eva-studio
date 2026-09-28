"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Building2, ArrowLeft, Users, Handshake, Globe, Phone, MapPin,
  Trash2, Clock, ChevronRight, Loader2, Link2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DealDrawer } from "@/components/crm/deal-drawer";
import { cn, formatRelativeDate } from "@/lib/utils";

interface Company {
  id: string; name: string; cnpj: string; sector: string; size: number | null;
  website: string; phone: string; linkedinUrl: string; address: string;
  city: string; uf: string; zipcode: string; description: string; revenue: string;
  owner: { id: string; name: string } | null;
  createdAt: string;
}
interface Totals { openCount: number; openCents: number; wonCents: number }
interface ContactRow { id: string; name: string; jobTitle: string; email: string; phone: string }
interface DealRow {
  id: string; name: string; amountCents: number; probability: number;
  stage: string; stageType: string; pipeline: string; closedAt: string | null; updatedAt: string;
}
interface TaskRow {
  id: string; text: string; dueAt: string | null; doneAt: string | null;
  contact: { id: string; name: string } | null; deal: { id: string; name: string } | null;
}
interface NoteRow {
  id: string; text: string; createdAt: string;
  contact: { id: string; name: string } | null; deal: { id: string; name: string } | null;
}

interface Payload {
  company: Company; totals: Totals;
  contacts: ContactRow[]; deals: DealRow[]; tasks: TaskRow[]; notes: NoteRow[];
}

function money(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function formatCnpj(raw: string): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length !== 14) return raw;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

function normalizeUrl(url: string): string {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

/**
 * Ficha da empresa.
 *
 * A tela de Empresas listava cards que não abriam. A conta existia no banco,
 * com contatos e negócios ligados nela, e não tinha onde olhar isso junto —
 * que é o motivo inteiro de existir uma entidade Empresa em venda B2B.
 */
export default function EmpresaPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const router = useRouter();

  const [data, setData] = React.useState<Payload | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);
  const [dealAberto, setDealAberto] = React.useState<string | null>(null);
  const [form, setForm] = React.useState<Partial<Company>>({});

  const carregar = React.useCallback(async () => {
    const res = await fetch(`/api/companies/${companyId}`);
    if (!res.ok) {
      setErro(res.status === 404 ? "Empresa não encontrada." : "Não foi possível carregar.");
      return;
    }
    const d: Payload = await res.json();
    setData(d);
    setForm(d.company);
  }, [companyId]);

  React.useEffect(() => { carregar(); }, [carregar]);

  async function patch(body: Record<string, unknown>) {
    setSalvando(true);
    const res = await fetch(`/api/companies/${companyId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSalvando(false);
    if (!res.ok) {
      setErro((await res.json()).error ?? "Não foi possível salvar.");
      return;
    }
    setErro(null);
    carregar();
  }

  async function alternarTarefa(id: string, feita: boolean) {
    await fetch(`/api/tasks/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: !feita }),
    });
    carregar();
  }

  async function apagar() {
    if (!confirm("Apagar esta empresa? Os contatos e negócios continuam, apenas ficam sem empresa.")) return;
    await fetch(`/api/companies/${companyId}`, { method: "DELETE" });
    router.push("/empresas");
  }

  if (erro && !data) {
    return (
      <div className="flex flex-col gap-4">
        <Link href="/empresas" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-text-tertiary hover:text-text-primary">
          <ArrowLeft size={14} /> Empresas
        </Link>
        <p className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</p>
      </div>
    );
  }

  if (!data) return <p className="text-[14px] text-text-tertiary">Carregando...</p>;

  const { company, totals, contacts, deals, tasks, notes } = data;
  const tarefasAbertas = tasks.filter((t) => !t.doneAt).length;
  const endereco = [company.address, company.city && company.uf ? `${company.city}/${company.uf}` : company.city]
    .filter(Boolean).join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <Link href="/empresas" className="inline-flex w-fit items-center gap-1.5 text-[13px] text-text-tertiary hover:text-text-primary">
        <ArrowLeft size={14} /> Empresas
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-surface-3">
            <Building2 size={24} className="text-text-secondary" />
          </span>
          <div className="min-w-0">
            <input
              value={form.name ?? ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onBlur={() => form.name !== company.name && patch({ name: form.name })}
              className="w-full bg-transparent font-display text-2xl font-semibold text-text-primary outline-none"
            />
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-text-tertiary">
              {company.cnpj && <span className="font-mono">{formatCnpj(company.cnpj)}</span>}
              {company.sector && <span>{company.sector}</span>}
              {endereco && <span className="inline-flex items-center gap-1"><MapPin size={12} /> {endereco}</span>}
              {company.phone && <span className="inline-flex items-center gap-1"><Phone size={12} /> {company.phone}</span>}
              {company.website && (
                <a
                  href={normalizeUrl(company.website)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-text-primary"
                >
                  <Globe size={12} /> {company.website.replace(/^https?:\/\//, "")}
                </a>
              )}
              {company.linkedinUrl && (
                <a
                  href={normalizeUrl(company.linkedinUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:text-text-primary"
                >
                  <Link2 size={12} /> LinkedIn
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {salvando && <Loader2 size={15} className="animate-spin text-text-tertiary" />}
          <Button variant="ghost" onClick={apagar} className="text-danger hover:bg-danger/10">
            <Trash2 size={15} /> Apagar
          </Button>
        </div>
      </header>

      {erro && <p className="rounded-2xl bg-danger/10 px-4 py-3 text-sm text-danger">{erro}</p>}

      {/* Três números, não um painel. Em conta B2B o que se pergunta é quanto
          está aberto, quanto já fechou e quantas pessoas conheço lá dentro. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="flex flex-col gap-1">
          <span className="text-[12px] text-text-tertiary">Em aberto</span>
          <span className="font-display text-xl font-semibold text-text-primary">{money(totals.openCents)}</span>
          <span className="text-[12px] text-text-tertiary">{totals.openCount} negócio(s)</span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="text-[12px] text-text-tertiary">Já ganho</span>
          <span className="font-display text-xl font-semibold text-emerald-400">{money(totals.wonCents)}</span>
          <span className="text-[12px] text-text-tertiary">histórico da conta</span>
        </Card>
        <Card className="flex flex-col gap-1">
          <span className="text-[12px] text-text-tertiary">Pessoas</span>
          <span className="font-display text-xl font-semibold text-text-primary">{contacts.length}</span>
          <span className="text-[12px] text-text-tertiary">
            {tarefasAbertas > 0 ? `${tarefasAbertas} tarefa(s) em aberto` : "nenhuma tarefa aberta"}
          </span>
        </Card>
      </div>

      <Tabs defaultValue="visao">
        <TabsList className="mb-4">
          <TabsTrigger value="visao">Visão geral</TabsTrigger>
          <TabsTrigger value="pessoas">Pessoas ({contacts.length})</TabsTrigger>
          <TabsTrigger value="negocios">Negócios ({deals.length})</TabsTrigger>
          <TabsTrigger value="dados">Dados</TabsTrigger>
        </TabsList>

        <TabsContent value="visao" className="flex flex-col gap-6 lg:flex-row">
          <section className="min-w-0 flex-1">
            <Label>Tarefas da conta</Label>
            <div className="mt-2 flex flex-col gap-1">
              {tasks.length === 0 ? (
                <p className="text-[12.5px] text-text-tertiary">Nenhuma tarefa ligada a esta empresa.</p>
              ) : (
                tasks.map((t) => {
                  const atrasada = !t.doneAt && !!t.dueAt && new Date(t.dueAt).getTime() < Date.now();
                  return (
                    <label key={t.id} className="flex cursor-pointer items-start gap-2.5 rounded-xl px-2 py-1.5 hover:bg-surface-2">
                      <Checkbox checked={!!t.doneAt} onCheckedChange={() => alternarTarefa(t.id, !!t.doneAt)} />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-[13px]", t.doneAt ? "text-text-tertiary line-through" : "text-text-primary")}>
                          {t.text}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-text-tertiary">
                          {t.dueAt && !t.doneAt && (
                            <span className={cn("inline-flex items-center gap-1", atrasada && "text-danger")}>
                              <Clock size={10} /> {formatRelativeDate(t.dueAt)}
                            </span>
                          )}
                          {t.deal && <span>{t.deal.name}</span>}
                          {t.contact && <span>{t.contact.name}</span>}
                        </span>
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </section>

          <section className="min-w-0 flex-1">
            <Label>Últimas notas</Label>
            <div className="mt-2 flex flex-col gap-2.5">
              {notes.length === 0 ? (
                <p className="text-[12.5px] text-text-tertiary">Nada registrado nas pessoas e negócios desta conta.</p>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className="rounded-2xl bg-surface-2 px-3.5 py-2.5">
                    <p className="whitespace-pre-wrap text-[12.5px] text-text-secondary">{n.text}</p>
                    <p className="mt-1 text-[11px] text-text-tertiary">
                      {formatRelativeDate(n.createdAt)}
                      {n.deal ? ` · ${n.deal.name}` : n.contact ? ` · ${n.contact.name}` : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </TabsContent>

        <TabsContent value="pessoas">
          {contacts.length === 0 ? (
            <p className="text-[13px] text-text-tertiary">
              Nenhum contato nesta empresa. Vincule pela ficha do contato, na tela de Contatos.
            </p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {contacts.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Users size={13} className="shrink-0 text-text-tertiary" />
                      <span className="truncate text-[13.5px] text-text-primary">{c.name || "Sem nome"}</span>
                    </div>
                    <div className="mt-0.5 truncate text-[11.5px] text-text-tertiary">
                      {[c.jobTitle, c.email || c.phone].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                  <button
                    onClick={() => patch({ removeContactId: c.id })}
                    className="shrink-0 rounded-lg px-2 py-1 text-[11.5px] text-text-tertiary hover:bg-danger/10 hover:text-danger"
                  >
                    Desvincular
                  </button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="negocios">
          <div className="flex flex-col gap-2">
            {deals.length === 0 ? (
              <p className="text-[13px] text-text-tertiary">Nenhum negócio nesta conta ainda.</p>
            ) : (
              deals.map((d) => (
                <button
                  key={d.id}
                  onClick={() => setDealAberto(d.id)}
                  className="group flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3 text-left transition-colors hover:bg-surface-3"
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-2">
                      <Handshake size={13} className="shrink-0 text-text-tertiary" />
                      <span className="truncate text-[13.5px] text-text-primary">{d.name}</span>
                    </span>
                    <span className="mt-0.5 block truncate text-[11.5px] text-text-tertiary">
                      {d.pipeline} · {d.stage} · atualizado {formatRelativeDate(d.updatedAt)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2.5">
                    {d.amountCents > 0 && (
                      <span className="text-[13px] font-semibold text-text-primary">{money(d.amountCents)}</span>
                    )}
                    {d.stageType === "won" ? (
                      <Badge variant="success">Ganho</Badge>
                    ) : d.stageType === "lost" ? (
                      <Badge variant="danger">Perdido</Badge>
                    ) : (
                      <Badge>{d.probability}%</Badge>
                    )}
                    <ChevronRight size={15} className="text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100" />
                  </span>
                </button>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="dados">
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <Field label="CNPJ" value={form.cnpj ?? ""} onChange={(v) => setForm({ ...form, cnpj: v })} onSave={(v) => patch({ cnpj: v })} />
            <Field label="Setor" value={form.sector ?? ""} onChange={(v) => setForm({ ...form, sector: v })} onSave={(v) => patch({ sector: v })} />
            <Field label="Site" value={form.website ?? ""} onChange={(v) => setForm({ ...form, website: v })} onSave={(v) => patch({ website: v })} />
            <Field label="Telefone" value={form.phone ?? ""} onChange={(v) => setForm({ ...form, phone: v })} onSave={(v) => patch({ phone: v })} />
            <Field label="LinkedIn" value={form.linkedinUrl ?? ""} onChange={(v) => setForm({ ...form, linkedinUrl: v })} onSave={(v) => patch({ linkedinUrl: v })} />
            <Field label="Faturamento" value={form.revenue ?? ""} onChange={(v) => setForm({ ...form, revenue: v })} onSave={(v) => patch({ revenue: v })} />
            <Field label="Endereço" value={form.address ?? ""} onChange={(v) => setForm({ ...form, address: v })} onSave={(v) => patch({ address: v })} />
            <div className="grid grid-cols-[1fr_88px] gap-3">
              <Field label="Cidade" value={form.city ?? ""} onChange={(v) => setForm({ ...form, city: v })} onSave={(v) => patch({ city: v })} />
              <Field label="UF" value={form.uf ?? ""} onChange={(v) => setForm({ ...form, uf: v })} onSave={(v) => patch({ uf: v })} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="e-desc">Descrição</Label>
              <Textarea
                id="e-desc"
                rows={4}
                value={form.description ?? ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                onBlur={() => form.description !== company.description && patch({ description: form.description })}
              />
            </div>
            <p className="text-[11.5px] text-text-tertiary sm:col-span-2">
              Cadastrada {formatRelativeDate(company.createdAt)}
              {company.owner ? ` · responsável ${company.owner.name}` : ""}
            </p>
          </div>
        </TabsContent>
      </Tabs>

      {dealAberto && (
        <DealDrawer dealId={dealAberto} onClose={() => setDealAberto(null)} onChanged={carregar} />
      )}
    </div>
  );
}

/** Campo que salva ao sair, igual ao resto do CRM: não existe botão Salvar. */
function Field({
  label, value, onChange, onSave,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSave: (v: string) => void;
}) {
  const inicial = React.useRef(value);
  React.useEffect(() => { inicial.current = value; /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);
  const id = React.useId();
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { if (value !== inicial.current) { inicial.current = value; onSave(value); } }}
      />
    </div>
  );
}
