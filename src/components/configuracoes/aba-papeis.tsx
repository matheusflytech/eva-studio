"use client";

import * as React from "react";
import { Copy, Lock, Plus, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { MatrizDePermissoes } from "./matriz-de-permissoes";
import { ESCOPO_ROTULO, MODULOS_COM_ESCOPO, type EscoposDoPapel, type EscopoDeDados } from "@/lib/permissoes/catalogo";
import { cn } from "@/lib/utils";

interface PapelSistema {
  id: string;
  nome: string;
  descricao: string;
  permissoes: string[];
}
interface PapelPersonalizado {
  id: string;
  name: string;
  description: string;
  permissions: string[];
  groupIds: string[];
  dataScope: EscoposDoPapel;
  membros: number;
}
interface Grupo {
  id: string;
  name: string;
}

type Rascunho = Omit<PapelPersonalizado, "id" | "membros"> & { id: string | null };

const ESCOPO_PADRAO: EscoposDoPapel = { negocios: "todos", contatos: "todos", conversas: "todos" };
const NOME_DO_MODULO: Record<string, string> = { negocios: "Negócios", contatos: "Contatos", conversas: "Conversas" };

// Papel = o que a pessoa É no contrato (um por pessoa). Os de sistema não
// mudam (dá para duplicar e ajustar); os personalizados são do contrato.
export function AbaPapeis({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [sistema, setSistema] = React.useState<PapelSistema[]>([]);
  const [personalizados, setPersonalizados] = React.useState<PapelPersonalizado[]>([]);
  const [grupos, setGrupos] = React.useState<Grupo[]>([]);
  const [aberto, setAberto] = React.useState<string>("owner");
  const [rascunho, setRascunho] = React.useState<Rascunho | null>(null);
  const [erro, setErro] = React.useState<string | null>(null);
  const [salvando, setSalvando] = React.useState(false);

  const carregar = React.useCallback(async () => {
    const [r, g] = await Promise.all([fetch("/api/roles"), fetch("/api/permission-groups")]);
    if (r.ok) {
      const d = await r.json();
      setSistema(d.sistema ?? []);
      setPersonalizados(d.personalizados ?? []);
    }
    if (g.ok) setGrupos((await g.json()).grupos ?? []);
  }, []);

  React.useEffect(() => {
    // Fora do corpo do efeito: a primeira carga não dispara setState síncrono.
    Promise.resolve().then(carregar);
  }, [carregar]);

  function duplicar(base: { nome: string; permissoes: string[]; groupIds?: string[]; dataScope?: EscoposDoPapel }) {
    setErro(null);
    setRascunho({
      id: null,
      name: `${base.nome} (cópia)`,
      description: "",
      permissions: base.permissoes,
      groupIds: base.groupIds ?? [],
      dataScope: base.dataScope ?? ESCOPO_PADRAO,
    });
  }

  function editar(p: PapelPersonalizado) {
    setErro(null);
    setRascunho({ id: p.id, name: p.name, description: p.description, permissions: p.permissions, groupIds: p.groupIds, dataScope: p.dataScope });
  }

  async function salvar() {
    if (!rascunho) return;
    setSalvando(true);
    setErro(null);
    const res = await fetch(rascunho.id ? `/api/roles/${rascunho.id}` : "/api/roles", {
      method: rascunho.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rascunho),
    });
    setSalvando(false);
    if (!res.ok) {
      setErro((await res.json().catch(() => ({}))).error ?? "Não foi possível salvar o papel.");
      return;
    }
    setRascunho(null);
    carregar();
  }

  async function apagar(p: PapelPersonalizado) {
    if (!window.confirm(`Apagar o papel "${p.name}"? Quem tem esse papel volta ao papel de sistema que já tinha.`)) return;
    await fetch(`/api/roles/${p.id}`, { method: "DELETE" });
    carregar();
  }

  const selecionadoSistema = sistema.find((s) => s.id === aberto);
  const selecionadoPersonalizado = personalizados.find((p) => p.id === aberto);

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardHeader>
          <CardTitle>Papéis e permissões</CardTitle>
          <CardDescription>
            O <strong className="text-text-primary">papel</strong> é o que a pessoa é no contrato — cada pessoa tem um.
            Os papéis de sistema não mudam; para ajustar, duplique e edite. Para dar um acesso a mais só para alguns, use
            um <strong className="text-text-primary">grupo</strong>.
          </CardDescription>
        </CardHeader>

        <div className="flex flex-wrap gap-2">
          {sistema.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setAberto(s.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-[13px] transition-colors",
                aberto === s.id ? "border-accent-500 bg-accent-500/10 text-text-primary" : "border-border-default text-text-secondary hover:text-text-primary"
              )}
            >
              <Lock size={12} className="text-text-tertiary" /> {s.nome}
            </button>
          ))}
          {personalizados.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setAberto(p.id)}
              className={cn(
                "rounded-xl border px-3 py-1.5 text-[13px] transition-colors",
                aberto === p.id ? "border-accent-500 bg-accent-500/10 text-text-primary" : "border-border-default text-text-secondary hover:text-text-primary"
              )}
            >
              {p.name} <span className="text-text-tertiary">· {p.membros}</span>
            </button>
          ))}
          {podeGerenciar && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => duplicar({ nome: "Novo papel", permissoes: [] })}
            >
              <Plus size={14} /> Criar papel
            </Button>
          )}
        </div>

        {selecionadoSistema && !rascunho && (
          <div className="mt-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-text-secondary">
                <Badge className="mr-2">Papel de sistema</Badge>
                {selecionadoSistema.descricao}
              </p>
              {podeGerenciar && (
                <Button variant="secondary" size="sm" onClick={() => duplicar(selecionadoSistema)}>
                  <Copy size={14} /> Duplicar
                </Button>
              )}
            </div>
            <MatrizDePermissoes valor={selecionadoSistema.permissoes} somenteLeitura />
          </div>
        )}

        {selecionadoPersonalizado && !rascunho && (
          <div className="mt-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[13px] text-text-secondary">{selecionadoPersonalizado.description || "Papel personalizado."}</p>
              {podeGerenciar && (
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" onClick={() => editar(selecionadoPersonalizado)}>
                    Editar
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => duplicar({ nome: selecionadoPersonalizado.name, permissoes: selecionadoPersonalizado.permissions, groupIds: selecionadoPersonalizado.groupIds, dataScope: selecionadoPersonalizado.dataScope })}
                  >
                    <Copy size={14} /> Duplicar
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => apagar(selecionadoPersonalizado)} aria-label="Apagar papel">
                    <Trash2 size={14} />
                  </Button>
                </div>
              )}
            </div>
            <p className="text-[12.5px] text-text-tertiary">
              Vê:{" "}
              {MODULOS_COM_ESCOPO.map((m) => `${NOME_DO_MODULO[m]} — ${ESCOPO_ROTULO[selecionadoPersonalizado.dataScope[m]]}`).join(" · ")}
            </p>
            <MatrizDePermissoes valor={selecionadoPersonalizado.permissions} somenteLeitura />
          </div>
        )}
      </Card>

      {rascunho && (
        <Card>
          <CardHeader>
            <CardTitle>{rascunho.id ? "Editar papel" : "Novo papel"}</CardTitle>
            <CardDescription>Marque o que quem tiver este papel pode fazer. Clique no nome do módulo para marcar a linha inteira.</CardDescription>
          </CardHeader>
          <div className="flex flex-col gap-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label>Nome</Label>
                <Input value={rascunho.name} onChange={(e) => setRascunho({ ...rascunho, name: e.target.value })} />
              </div>
              <div>
                <Label>Descrição</Label>
                <Input
                  value={rascunho.description}
                  placeholder="Ex.: vendedor externo, só os próprios negócios"
                  onChange={(e) => setRascunho({ ...rascunho, description: e.target.value })}
                />
              </div>
            </div>

            <div>
              <Label>O que a pessoa enxerga</Label>
              <div className="mt-1 grid gap-3 sm:grid-cols-3">
                {MODULOS_COM_ESCOPO.map((m) => (
                  <div key={m}>
                    <p className="mb-1 text-[12px] text-text-tertiary">{NOME_DO_MODULO[m]}</p>
                    <Select
                      value={rascunho.dataScope[m]}
                      onChange={(e) =>
                        setRascunho({ ...rascunho, dataScope: { ...rascunho.dataScope, [m]: e.target.value as EscopoDeDados } })
                      }
                      aria-label={`Escopo de ${NOME_DO_MODULO[m]}`}
                    >
                      {(Object.keys(ESCOPO_ROTULO) as EscopoDeDados[]).map((e) => (
                        <option key={e} value={e}>
                          {ESCOPO_ROTULO[e]}
                        </option>
                      ))}
                    </Select>
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[11.5px] text-text-tertiary">
                “Os meus” = onde a pessoa é a responsável (na conversa, quem atende). “Da minha equipe” inclui os colegas das
                equipes dela.
              </p>
            </div>

            {grupos.length > 0 && (
              <div>
                <Label>Grupos incluídos no papel</Label>
                <div className="mt-1 flex flex-wrap gap-3">
                  {grupos.map((g) => (
                    <label key={g.id} className="inline-flex items-center gap-2 text-[13px] text-text-secondary">
                      <Checkbox
                        checked={rascunho.groupIds.includes(g.id)}
                        onCheckedChange={(v) =>
                          setRascunho({
                            ...rascunho,
                            groupIds: v ? [...rascunho.groupIds, g.id] : rascunho.groupIds.filter((x) => x !== g.id),
                          })
                        }
                      />
                      {g.name}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <MatrizDePermissoes valor={rascunho.permissions} onChange={(p) => setRascunho({ ...rascunho, permissions: p })} />

            {erro && <p className="text-[13px] text-danger">{erro}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando..." : "Salvar papel"}
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
