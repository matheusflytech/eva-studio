"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { MatrizDePermissoes } from "./matriz-de-permissoes";

interface Grupo {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}
type Rascunho = Omit<Grupo, "id"> & { id: string | null };

// Grupo = pacote extra de permissões, SOMADO ao papel. Serve para dar um
// acesso a mais a algumas pessoas sem criar um papel novo (ex.: "Exportar
// dados" só para dois atendentes).
export function AbaGrupos({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [grupos, setGrupos] = React.useState<Grupo[]>([]);
  const [rascunho, setRascunho] = React.useState<Rascunho | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    const r = await fetch("/api/permission-groups");
    if (r.ok) setGrupos((await r.json()).grupos ?? []);
  }, []);
  React.useEffect(() => {
    // Fora do corpo do efeito: a primeira carga não dispara setState síncrono.
    Promise.resolve().then(carregar);
  }, [carregar]);

  async function salvar() {
    if (!rascunho) return;
    setErro(null);
    const res = await fetch(rascunho.id ? `/api/permission-groups/${rascunho.id}` : "/api/permission-groups", {
      method: rascunho.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rascunho),
    });
    if (!res.ok) {
      setErro((await res.json().catch(() => ({}))).error ?? "Não foi possível salvar o grupo.");
      return;
    }
    setRascunho(null);
    carregar();
  }

  async function apagar(g: Grupo) {
    if (!window.confirm(`Apagar o grupo "${g.name}"? Quem recebia essas permissões por ele deixa de ter.`)) return;
    await fetch(`/api/permission-groups/${g.id}`, { method: "DELETE" });
    carregar();
  }

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Grupos de permissões</CardTitle>
          <CardDescription>
            Um <strong className="text-text-primary">grupo</strong> é um pacote extra que se soma ao papel — por exemplo
            “Financeiro” ou “Exportar dados”. Dá para colocar o grupo num papel (todos daquele papel ganham) ou direto
            numa pessoa, na aba Membros.
          </CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-2">
          {grupos.length === 0 && <p className="text-[13px] text-text-tertiary">Nenhum grupo ainda.</p>}
          {grupos.map((g) => (
            <div key={g.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-text-primary">{g.name}</p>
                <p className="truncate text-[12px] text-text-tertiary">
                  {g.description || `${g.permissions.length} permiss${g.permissions.length === 1 ? "ão" : "ões"}`}
                </p>
              </div>
              {podeGerenciar && (
                <div className="flex shrink-0 gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setRascunho({ ...g })}>
                    Editar
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => apagar(g)} aria-label={`Apagar o grupo ${g.name}`}>
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
              onClick={() => setRascunho({ id: null, name: "", description: "", permissions: [] })}
            >
              <Plus size={14} /> Criar grupo
            </Button>
          )}
        </div>
      </Card>

      {rascunho && (
        <Card>
          <CardHeader>
            <CardTitle>{rascunho.id ? "Editar grupo" : "Novo grupo"}</CardTitle>
          </CardHeader>
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Nome</Label>
                <Input value={rascunho.name} placeholder="Ex.: Exportar dados" onChange={(e) => setRascunho({ ...rascunho, name: e.target.value })} />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input value={rascunho.description} onChange={(e) => setRascunho({ ...rascunho, description: e.target.value })} />
              </div>
            </div>
            <MatrizDePermissoes valor={rascunho.permissions} onChange={(p) => setRascunho({ ...rascunho, permissions: p })} />
            {erro && <p className="text-[13px] text-danger">{erro}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={salvar}>
                Salvar grupo
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
