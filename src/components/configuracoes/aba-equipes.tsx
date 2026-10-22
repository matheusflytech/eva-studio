"use client";

import * as React from "react";
import { Plus, Trash2, Crown } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

interface Equipe {
  id: string;
  name: string;
  leaderId: string | null;
  memberIds: string[];
}
interface Membro {
  id: string;
  name: string;
  email: string;
}
type Rascunho = Omit<Equipe, "id"> & { id: string | null };

// Equipe = quem trabalha junto. É o que define "os da minha equipe" no escopo
// de dados dos papéis (negócios, contatos e conversas).
export function AbaEquipes({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [equipes, setEquipes] = React.useState<Equipe[]>([]);
  const [membros, setMembros] = React.useState<Membro[]>([]);
  const [rascunho, setRascunho] = React.useState<Rascunho | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    const [t, m] = await Promise.all([fetch("/api/teams"), fetch("/api/members")]);
    if (t.ok) setEquipes((await t.json()).equipes ?? []);
    if (m.ok) setMembros((await m.json()).members ?? []);
  }, []);
  React.useEffect(() => {
    // Fora do corpo do efeito: a primeira carga não dispara setState síncrono.
    Promise.resolve().then(carregar);
  }, [carregar]);

  const nome = (id: string | null) => membros.find((m) => m.id === id)?.name ?? "—";

  async function salvar() {
    if (!rascunho) return;
    setErro(null);
    const res = await fetch(rascunho.id ? `/api/teams/${rascunho.id}` : "/api/teams", {
      method: rascunho.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rascunho),
    });
    if (!res.ok) {
      setErro((await res.json().catch(() => ({}))).error ?? "Não foi possível salvar a equipe.");
      return;
    }
    setRascunho(null);
    carregar();
  }

  async function apagar(e: Equipe) {
    if (!window.confirm(`Apagar a equipe "${e.name}"? Ninguém sai do contrato.`)) return;
    await fetch(`/api/teams/${e.id}`, { method: "DELETE" });
    carregar();
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Equipes</CardTitle>
          <CardDescription>
            Agrupe quem trabalha junto (ex.: “Vendas SP”, “Suporte”). Num papel com “os da minha equipe”, a pessoa vê os
            registros dela e dos colegas de equipe.
          </CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-2">
          {equipes.length === 0 && <p className="text-[13px] text-text-tertiary">Nenhuma equipe ainda.</p>}
          {equipes.map((e) => (
            <div key={e.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-text-primary">{e.name}</p>
                <p className="truncate text-[12px] text-text-tertiary">
                  {e.leaderId && (
                    <>
                      <Crown size={11} className="mr-1 inline" /> {nome(e.leaderId)} ·{" "}
                    </>
                  )}
                  {e.memberIds.length} pessoa{e.memberIds.length === 1 ? "" : "s"}
                </p>
              </div>
              {podeGerenciar && (
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setRascunho({ ...e })}>
                    Editar
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => apagar(e)} aria-label={`Apagar a equipe ${e.name}`}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              )}
            </div>
          ))}
          {podeGerenciar && !rascunho && (
            <Button
              variant="secondary"
              size="sm"
              className="self-start"
              onClick={() => setRascunho({ id: null, name: "", leaderId: null, memberIds: [] })}
            >
              <Plus size={14} /> Criar equipe
            </Button>
          )}
        </div>
      </Card>

      {rascunho && (
        <Card>
          <CardHeader>
            <CardTitle>{rascunho.id ? "Editar equipe" : "Nova equipe"}</CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Nome</Label>
                <Input value={rascunho.name} onChange={(e) => setRascunho({ ...rascunho, name: e.target.value })} />
              </div>
              <div>
                <Label>Líder</Label>
                <Select
                  value={rascunho.leaderId ?? ""}
                  onChange={(e) => setRascunho({ ...rascunho, leaderId: e.target.value || null })}
                  aria-label="Líder da equipe"
                >
                  <option value="">Sem líder</option>
                  {membros.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label>Membros</Label>
              <div className="mt-1 grid gap-2 sm:grid-cols-2">
                {membros.map((m) => (
                  <label key={m.id} className="inline-flex items-center gap-2 text-[13px] text-text-secondary">
                    <Checkbox
                      checked={rascunho.memberIds.includes(m.id)}
                      onCheckedChange={(v) =>
                        setRascunho({
                          ...rascunho,
                          memberIds: v ? [...rascunho.memberIds, m.id] : rascunho.memberIds.filter((x) => x !== m.id),
                        })
                      }
                    />
                    <span className="truncate">{m.name}</span>
                  </label>
                ))}
              </div>
            </div>
            {erro && <p className="text-[13px] text-danger">{erro}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={salvar}>
                Salvar equipe
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setRascunho(null)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
