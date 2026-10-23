"use client";

import * as React from "react";
import { Copy, Lock, Plus, Trash2 } from "lucide-react";
import { Field, Input, Label } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Notice } from "@/components/ui/notice";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { MatrizDePermissoes } from "./matriz-de-permissoes";
import { CabecalhoDaSecao, EsqueletoDeLista, ItemDeConfig, ListaDeConfig, RotuloDeGrupo } from "./secao";
import { ESCOPO_ROTULO, MODULOS_COM_ESCOPO, type EscoposDoPapel, type EscopoDeDados } from "@/lib/permissoes/catalogo";

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
// v5: os papéis viram uma lista; clicar abre a gaveta com as permissões
// (só leitura) e as ações. Criar, duplicar e editar usam a mesma gaveta.
export function AbaPapeis({ podeGerenciar }: { podeGerenciar: boolean }) {
  const [sistema, setSistema] = React.useState<PapelSistema[]>([]);
  const [personalizados, setPersonalizados] = React.useState<PapelPersonalizado[]>([]);
  const [grupos, setGrupos] = React.useState<Grupo[]>([]);
  const [carregado, setCarregado] = React.useState(false);
  const [aberto, setAberto] = React.useState<string | null>(null);
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
    setCarregado(true);
  }, []);

  React.useEffect(() => {
    // Fora do corpo do efeito: a primeira carga não dispara setState síncrono.
    Promise.resolve().then(carregar);
  }, [carregar]);

  function duplicar(base: { nome: string; permissoes: string[]; groupIds?: string[]; dataScope?: EscoposDoPapel }) {
    setErro(null);
    setAberto(null);
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
    setAberto(null);
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
    setAberto(null);
    await fetch(`/api/roles/${p.id}`, { method: "DELETE" });
    carregar();
  }

  const selecionadoSistema = sistema.find((s) => s.id === aberto);
  const selecionadoPersonalizado = personalizados.find((p) => p.id === aberto);

  return (
    <div>
      <CabecalhoDaSecao
        titulo="Papéis e permissões"
        descricao="O papel é o que a pessoa é no contrato; cada pessoa tem um. Os papéis de sistema não mudam: para ajustar, duplique e edite. Para dar um acesso a mais só para alguns, use um grupo."
        acoes={
          podeGerenciar && (
            <Button onClick={() => duplicar({ nome: "Novo papel", permissoes: [] })}>
              <Plus size={14} aria-hidden="true" /> Criar papel
            </Button>
          )
        }
      />

      {!carregado ? (
        <EsqueletoDeLista linhas={4} />
      ) : (
        <div className="flex flex-col gap-6">
          <div>
            <RotuloDeGrupo contagem={sistema.length}>Papéis de sistema</RotuloDeGrupo>
            <ListaDeConfig>
              {sistema.map((s) => (
                <ItemDeConfig
                  key={s.id}
                  icone={<Lock />}
                  titulo={s.nome}
                  detalhe={s.descricao}
                  onClick={() => setAberto(s.id)}
                  rotuloDoClique={`Ver as permissões de ${s.nome}`}
                  direita={
                    podeGerenciar && (
                      <IconButton aria-label={`Duplicar ${s.nome}`} tooltip="Duplicar" onClick={() => duplicar(s)}>
                        <Copy />
                      </IconButton>
                    )
                  }
                />
              ))}
            </ListaDeConfig>
          </div>

          <div>
            <RotuloDeGrupo contagem={personalizados.length}>Papéis do contrato</RotuloDeGrupo>
            {personalizados.length === 0 ? (
              <p className="border-y border-border-subtle px-1 py-5 text-small text-text-tertiary">
                Nenhum papel personalizado. Duplique um de sistema para começar.
              </p>
            ) : (
              <ListaDeConfig>
                {personalizados.map((p) => (
                  <ItemDeConfig
                    key={p.id}
                    titulo={p.name}
                    detalhe={p.description || "Papel personalizado."}
                    onClick={() => setAberto(p.id)}
                    rotuloDoClique={`Ver as permissões de ${p.name}`}
                    direita={
                      <span className="font-mono text-caption tabular-nums text-text-tertiary">
                        {p.membros} {p.membros === 1 ? "pessoa" : "pessoas"}
                      </span>
                    }
                  />
                ))}
              </ListaDeConfig>
            )}
          </div>
        </div>
      )}

      {/* Detalhe (só leitura) do papel escolhido. */}
      <Drawer open={!!(selecionadoSistema || selecionadoPersonalizado)} onOpenChange={(v) => !v && setAberto(null)}>
        {selecionadoSistema && (
          <DrawerContent
            size="lg"
            title={selecionadoSistema.nome}
            description={selecionadoSistema.descricao}
            footer={
              podeGerenciar && (
                <Button variant="secondary" onClick={() => duplicar(selecionadoSistema)}>
                  <Copy size={14} aria-hidden="true" /> Duplicar
                </Button>
              )
            }
          >
            <div className="flex flex-col gap-3">
              <Badge className="self-start">Papel de sistema</Badge>
              <MatrizDePermissoes valor={selecionadoSistema.permissoes} somenteLeitura />
            </div>
          </DrawerContent>
        )}
        {selecionadoPersonalizado && (
          <DrawerContent
            size="lg"
            title={selecionadoPersonalizado.name}
            description={selecionadoPersonalizado.description || "Papel personalizado."}
            footer={
              podeGerenciar && (
                <>
                  <Button variant="ghost" className="mr-auto text-danger hover:text-danger" onClick={() => apagar(selecionadoPersonalizado)}>
                    <Trash2 size={14} aria-hidden="true" /> Apagar papel
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      duplicar({
                        nome: selecionadoPersonalizado.name,
                        permissoes: selecionadoPersonalizado.permissions,
                        groupIds: selecionadoPersonalizado.groupIds,
                        dataScope: selecionadoPersonalizado.dataScope,
                      })
                    }
                  >
                    <Copy size={14} aria-hidden="true" /> Duplicar
                  </Button>
                  <Button onClick={() => editar(selecionadoPersonalizado)}>Editar</Button>
                </>
              )
            }
          >
            <div className="flex flex-col gap-3">
              <p className="text-small text-text-tertiary">
                Vê:{" "}
                {MODULOS_COM_ESCOPO.map((m) => `${NOME_DO_MODULO[m]}: ${ESCOPO_ROTULO[selecionadoPersonalizado.dataScope[m]]}`).join(" · ")}
              </p>
              <MatrizDePermissoes valor={selecionadoPersonalizado.permissions} somenteLeitura />
            </div>
          </DrawerContent>
        )}
      </Drawer>

      {/* Criar, duplicar ou editar. */}
      <Drawer open={!!rascunho} onOpenChange={(v) => !v && setRascunho(null)}>
        {rascunho && (
          <DrawerContent
            size="lg"
            title={rascunho.id ? "Editar papel" : "Novo papel"}
            description="Marque o que quem tiver este papel pode fazer. Clique no nome do módulo para marcar a linha inteira."
            footer={
              <>
                <Button variant="ghost" onClick={() => setRascunho(null)}>
                  Cancelar
                </Button>
                <Button onClick={salvar} disabled={salvando}>
                  {salvando ? "Salvando..." : "Salvar papel"}
                </Button>
              </>
            }
          >
            <div className="flex flex-col gap-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Nome">
                  <Input value={rascunho.name} onChange={(e) => setRascunho({ ...rascunho, name: e.target.value })} />
                </Field>
                <Field label="Descrição">
                  <Input
                    value={rascunho.description}
                    placeholder="Ex.: vendedor externo, só os próprios negócios"
                    onChange={(e) => setRascunho({ ...rascunho, description: e.target.value })}
                  />
                </Field>
              </div>

              <div>
                <Label>O que a pessoa enxerga</Label>
                <div className="mt-1 grid gap-3 sm:grid-cols-3">
                  {MODULOS_COM_ESCOPO.map((m) => (
                    <div key={m}>
                      <p className="mb-1 font-mono text-caption text-text-tertiary">{NOME_DO_MODULO[m]}</p>
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
                <p className="mt-1.5 text-caption text-text-tertiary">
                  “Os meus” = onde a pessoa é a responsável (na conversa, quem atende). “Da minha equipe” inclui os colegas das
                  equipes dela.
                </p>
              </div>

              {grupos.length > 0 && (
                <div>
                  <Label>Grupos incluídos no papel</Label>
                  <div className="mt-1 flex flex-wrap gap-x-4 gap-y-2">
                    {grupos.map((g) => (
                      <label key={g.id} className="inline-flex items-center gap-2 text-small text-text-secondary">
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

              {erro && <Notice tone="danger">{erro}</Notice>}
            </div>
          </DrawerContent>
        )}
      </Drawer>
    </div>
  );
}
