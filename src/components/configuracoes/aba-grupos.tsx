"use client";

import * as React from "react";
import { Ellipsis, Pencil, Plus, Trash2 } from "lucide-react";
import { Field, Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Notice } from "@/components/ui/notice";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { MatrizDePermissoes } from "./matriz-de-permissoes";
import { CabecalhoDaSecao, EsqueletoDeLista, ItemDeConfig, ListaDeConfig, VazioDeConfig } from "./secao";

interface Grupo {
  id: string;
  name: string;
  description: string;
  permissions: string[];
}
type Rascunho = Omit<Grupo, "id"> & { id: string | null };

// Grupo = pacote extra de permissões, SOMADO ao papel. Serve para dar um
// acesso a mais a algumas pessoas sem criar um papel novo (ex.: "Exportar
// dados" só para dois atendentes). v5: lista com linhas finas; criar e
// editar abrem numa gaveta, com Salvar/Cancelar no rodapé.
export function AbaGrupos({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [grupos, setGrupos] = React.useState<Grupo[] | null>(null);
  const [rascunho, setRascunho] = React.useState<Rascunho | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);

  const carregar = React.useCallback(async () => {
    const r = await fetch("/api/permission-groups");
    if (r.ok) setGrupos((await r.json()).grupos ?? []);
    else setGrupos((g) => g ?? []);
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

  const novo = () => {
    setErro(null);
    setRascunho({ id: null, name: "", description: "", permissions: [] });
  };

  return (
    <div>
      <CabecalhoDaSecao
        titulo="Grupos de permissões"
        descricao={
          <>
            Um grupo é um pacote extra que se soma ao papel, por exemplo “Financeiro” ou “Exportar dados”. Dá para colocar o
            grupo num papel (todos daquele papel ganham) ou direto numa pessoa, em Membros.
          </>
        }
        acoes={
          podeGerenciar && (
            <Button onClick={novo}>
              <Plus size={14} aria-hidden="true" /> Criar grupo
            </Button>
          )
        }
      />

      {grupos === null ? (
        <EsqueletoDeLista />
      ) : grupos.length === 0 ? (
        <VazioDeConfig>Nenhum grupo ainda.</VazioDeConfig>
      ) : (
        <ListaDeConfig>
          {grupos.map((g) => (
            <ItemDeConfig
              key={g.id}
              titulo={g.name}
              detalhe={g.description || undefined}
              onClick={podeGerenciar ? () => setRascunho({ ...g }) : undefined}
              rotuloDoClique={`Editar o grupo ${g.name}`}
              direita={
                <>
                  <span className="font-mono text-caption tabular-nums text-text-tertiary">
                    {g.permissions.length} permiss{g.permissions.length === 1 ? "ão" : "ões"}
                  </span>
                  {podeGerenciar && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <IconButton aria-label={`Mais ações do grupo ${g.name}`}>
                          <Ellipsis />
                        </IconButton>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onSelect={() => setRascunho({ ...g })}>
                          <Pencil /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem tone="danger" onSelect={() => void apagar(g)}>
                          <Trash2 /> Apagar grupo
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
            size="lg"
            title={rascunho.id ? "Editar grupo" : "Novo grupo"}
            description="Marque o que o grupo acrescenta. Clique no nome do módulo para marcar a linha inteira."
            footer={
              <>
                <Button variant="ghost" onClick={() => setRascunho(null)}>
                  Cancelar
                </Button>
                <Button onClick={salvar}>Salvar grupo</Button>
              </>
            }
          >
            <div className="flex flex-col gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nome">
                  <Input value={rascunho.name} placeholder="Ex.: Exportar dados" onChange={(e) => setRascunho({ ...rascunho, name: e.target.value })} />
                </Field>
                <Field label="Descrição">
                  <Input value={rascunho.description} onChange={(e) => setRascunho({ ...rascunho, description: e.target.value })} />
                </Field>
              </div>
              <MatrizDePermissoes valor={rascunho.permissions} onChange={(p) => setRascunho({ ...rascunho, permissions: p })} />
              {erro && <Notice tone="danger">{erro}</Notice>}
            </div>
          </DrawerContent>
        )}
      </Drawer>
    </div>
  );
}
