"use client";

import * as React from "react";
import Link from "next/link";
import { Building2, Plus, Search, Loader2, Users, Handshake } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Textarea, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal, ModalContent } from "@/components/ui/modal";

interface Company {
  id: string;
  name: string;
  cnpj: string;
  sector: string;
  website: string;
  phone: string;
  city: string;
  uf: string;
  owner: { id: string; name: string } | null;
  contactCount: number;
  dealCount: number;
}

function formatCnpj(raw: string): string {
  const d = (raw ?? "").replace(/\D/g, "");
  if (d.length !== 14) return raw;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

export default function EmpresasPage() {
  const [companies, setCompanies] = React.useState<Company[]>([]);
  const [query, setQuery] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(true);
  const [showNew, setShowNew] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setIsLoading(true);
    const res = await fetch(`/api/companies${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`);
    const data = await res.json();
    setCompanies(data.companies ?? []);
    setIsLoading(false);
  }, [query]);

  React.useEffect(() => {
    const timer = setTimeout(() => refresh(), 300);
    return () => clearTimeout(timer);
  }, [refresh]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold text-text-primary">Empresas</h1>
          <p className="mt-1 max-w-2xl text-[15px] text-text-secondary">
            A conta por trás das pessoas. Em venda para empresa, cinco contatos do mesmo lugar são uma conta só, e é
            nela que o negócio acontece.
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus size={15} /> Nova empresa
        </Button>
      </header>

      <div className="relative max-w-md">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary" />
        <Input
          placeholder="Buscar por nome, CNPJ ou setor..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading && companies.length === 0 ? (
        <p className="text-[14px] text-text-tertiary">Carregando...</p>
      ) : companies.length === 0 ? (
        <EmptyState
          icon={<Building2 size={36} className="text-text-tertiary" />}
          title={query ? "Nenhuma empresa encontrada" : "Nenhuma empresa ainda"}
          description={
            query
              ? "Tente outro termo."
              : "Cadastre a primeira, ou vincule uma empresa a um contato existente na tela de Contatos."
          }
          action={!query ? <Button onClick={() => setShowNew(true)}><Plus size={15} /> Nova empresa</Button> : undefined}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((c) => (
            <Card key={c.id} className="flex flex-col gap-3 transition-colors hover:border-border-strong">
              <Link href={`/empresas/${c.id}`} className="min-w-0 outline-none">
                <div className="truncate font-medium text-text-primary">{c.name}</div>
                <div className="truncate text-[12px] text-text-tertiary">
                  {[c.sector, c.city && c.uf ? `${c.city}/${c.uf}` : c.city].filter(Boolean).join(" · ") || "—"}
                </div>
                {c.cnpj && <div className="mt-0.5 font-mono text-[11.5px] text-text-tertiary">{formatCnpj(c.cnpj)}</div>}
              </Link>
              <div className="flex items-center gap-4 border-t border-border-subtle pt-3 text-[12px] text-text-secondary">
                <span className="inline-flex items-center gap-1.5">
                  <Users size={13} className="text-text-tertiary" /> {c.contactCount}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Handshake size={13} className="text-text-tertiary" /> {c.dealCount}
                </span>
                {c.owner && <span className="ml-auto truncate text-text-tertiary">{c.owner.name}</span>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {showNew && (
        <NewCompanyModal onClose={() => setShowNew(false)} onCreated={() => { setShowNew(false); refresh(); }} />
      )}
    </div>
  );
}

function NewCompanyModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
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
      <ModalContent title="Nova empresa">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-[1fr_180px] gap-4">
            <div>
              <Label htmlFor="co-name">Nome</Label>
              <Input id="co-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="co-cnpj">CNPJ</Label>
              <Input
                id="co-cnpj"
                value={form.cnpj}
                onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                placeholder="só números"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="co-sector">Setor</Label>
              <Input id="co-sector" value={form.sector} onChange={(e) => setForm({ ...form, sector: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="co-site">Site</Label>
              <Input id="co-site" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="co-phone">Telefone</Label>
              <Input id="co-phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="grid grid-cols-[1fr_70px] gap-2">
              <div>
                <Label htmlFor="co-city">Cidade</Label>
                <Input id="co-city" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="co-uf">UF</Label>
                <Input
                  id="co-uf"
                  maxLength={2}
                  value={form.uf}
                  onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })}
                />
              </div>
            </div>
          </div>
          <div>
            <Label htmlFor="co-desc">Observações</Label>
            <Textarea
              id="co-desc"
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>

          {error && <p className="text-[13px] text-danger">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>Cancelar</Button>
            <Button onClick={save} disabled={busy || !form.name.trim()}>
              {busy && <Loader2 size={15} className="animate-spin" />} Criar
            </Button>
          </div>
        </div>
      </ModalContent>
    </Modal>
  );
}
