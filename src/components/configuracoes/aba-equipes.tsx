"use client";

import * as React from "react";
import { Crown, Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import { Field, Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Notice } from "@/components/ui/notice";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { CabecalhoDaSecao, EsqueletoDeLista, ItemDeConfig, ListaDeConfig, VazioDeConfig } from "./secao";

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
// de dados dos papéis (negócios, contatos e conversas). v5: lista com linhas
// finas; criar e editar abrem numa gaveta.
export function AbaEquipes({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [equipes, setEquipes] = React.useState<Equipe[] | null>(null);
  const [membros, setMembros] = React.useState<Membro[]>([]);
  const [rascunho, setRascunho] = React.useState<Rascunho | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    const [t, m] = await Promise.all([fetch("/api/teams"), fetch("/api/members")]);
    if (t.ok) setEquipes((await t.json()).equipes ?? []);
    else setEquipes((e) => e ?? []);
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

  const editar = (e: Equipe) => {
    setErro(null);
    setRascunho({ ...e });
  };

  return (
    <div>
      <CabecalhoDaSecao
        titulo="Equipes"
        descricao="Agrupe quem trabalha junto (ex.: “Vendas SP”, “Suporte”). Num papel com “os da minha equipe”, a pessoa vê os registros dela e dos colegas de equipe."
        acoes={
          podeGerenciar && (
            <Button
              onClick={() => {
                setErro(null);
                setRascunho({ id: null, name: "", leaderId: null, memberIds: [] });
              }}
            >
              <Plus size={14} aria-hidden="true" /> Criar equipe
            </Button>
          )
        }
      />

      {equipes === null ? (
        <EsqueletoDeLista />
      ) : equipes.length === 0 ? (
        <VazioDeConfig>Nenhuma equipe ainda.</VazioDeConfig>
      ) : (
        <ListaDeConfig>
          {equipes.map((e) => (
            <ItemDeConfig
              key={e.id}
              titulo={e.name}
              detalhe={
                e.leaderId ? (
                  <span className="inline-flex items-center gap-1">
                    <Crown size={11} aria-hidden="true" /> {nome(e.leaderId)}
                  </span>
                ) : (
                  "Sem líder"
                )
              }
              onClick={podeGerenciar ? () => editar(e) : undefined}
              rotuloDoClique={`Editar a equipe ${e.name}`}
              direita={
                <>
                  <span className="font-mono text-caption tabular-nums text-text-tertiary">
                    {e.memberIds.length} pessoa{e.memberIds.length === 1 ? "" : "s"}
                  </span>
                  {podeGerenciar && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton aria-label={`Mais ações da equipe ${e.name}`}>
                          <Ellipsis />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => editar(e)}>
                          <Pencil /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem tone="danger" onSelect={() => void apagar(e)}>
                          <Trash2 /> Apagar equipe
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </>
              }
            />
          ))}
        </ListaDeConfig>
      )}

      <Drawer open={!!rascunho} onOpenChange={(v) => !v && setRascunho(null)}>
        {rascunho && (
          <DrawerContent
            title={rascunho.id ? "Editar equipe" : "Nova equipe"}
            footer={
              <>
                <Button variant="ghost" onClick={() => setRascunho(null)}>
                  Cancelar
                </Button>
                <Button onClick={salvar}>Salvar equipe</Button>
              </>
            }
          >
            <div className="flex flex-col gap-4">
              <Field label="Nome">
                <Input value={rascunho.name} onChange={(e) => setRascunho({ ...rascunho, name: e.target.value })} />
              </Field>
              <Field label="Líder">
                <Select value={rascunho.leaderId ?? ""} onChange={(e) => setRascunho({ ...rascunho, leaderId: e.target.value || null })}>
                  <option value="">Sem líder</option>
                  {membros.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <div>
                <Label>Membros</Label>
                <div className="mt-1 flex flex-col divide-y divide-border-subtle border-y border-border-subtle">
                  {membros.map((m) => (
                    <label key={m.id} className="flex min-h-10 items-center gap-2.5 px-1 text-small text-text-secondary hover:text-text-primary">
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
                      <span className="ml-auto truncate text-caption text-text-tertiary">{m.email}</span>
                    </label>
                  ))}
                </div>
              </div>
              {erro && <Notice tone="danger">{erro}</Notice>}
            </div>
          </DrawerContent>
        )}
      </Drawer>
    </div>
  );
}
